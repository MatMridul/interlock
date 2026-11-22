"""Session storage so state survives across Lambda instances.

Two backends behind one small interface, chosen by INTERLOCK_STORE (memory | dynamodb):
  MemoryStore    default; used by every test and local run.
  DynamoStore    one on-demand table, partition key "pk" (string), TTL attribute "ttl".

An item is the JSON-able session snapshot plus a version number and a lease. Writes are
conditional on the version (optimistic locking), so two requests that read the same version
cannot both write: the second gets Conflict. The lease serialises chat turns across instances.
The same table also holds atomic daily counters (the model-call cap).
"""
import json
import os
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass

SESSION_TTL_S = 24 * 3600
LEASE_S = 90  # a chat turn longer than this loses its lease; its final write then conflicts and is dropped


class Conflict(Exception):
    """The item changed (or already exists) since it was read."""


class Busy(Exception):
    """Another request holds the session lease."""


@dataclass
class Item:
    data: dict
    version: int
    lease_until: float = 0.0


def snapshot_gate(gate):
    """Everything the gate needs to continue: state, executed log, guard counters. JSON-able."""
    g = gate._guard
    return {"state": gate._state, "log": [dict(e) for e in gate._log],
            "guard": None if g is None else {"draft": None if g.draft is None else dict(g.draft),
                                             "transfers": g.transfers, "rejects": g.rejects}}


def restore_gate(gate, snap):
    gate._state = snap["state"]
    gate._log[:] = [dict(e) for e in snap["log"]]
    g, s = gate._guard, snap["guard"]
    if g is not None and s is not None:
        g.draft = None if s["draft"] is None else dict(s["draft"])
        g.transfers, g.rejects = s["transfers"], s["rejects"]


class MemoryStore:
    def __init__(self, clock=time.time, max_items=1000):
        self._now, self._max = clock, max_items
        self._lock = threading.Lock()
        self._items = OrderedDict()  # pk -> (json str, version, lease_until, expires)
        self._counters = {}

    def get(self, pk):
        with self._lock:
            row = self._items.get(pk)
            if row is None or row[3] <= self._now():
                return None
            return Item(json.loads(row[0]), row[1], row[2])

    def put(self, pk, data, expected_version=None, lease_until=0.0):
        """Create (expected_version None) or update. Returns the new version or raises Conflict."""
        with self._lock:
            row = self._items.get(pk)
            live = row is not None and row[3] > self._now()
            if expected_version is None:
                if live:
                    raise Conflict(pk)
                version = 1
            else:
                if not live or row[1] != expected_version:
                    raise Conflict(pk)
                version = expected_version + 1
            self._items[pk] = (json.dumps(data), version, lease_until, self._now() + SESSION_TTL_S)
            self._items.move_to_end(pk)
            while len(self._items) > self._max:
                self._items.popitem(last=False)
            return version

    def incr_if_below(self, key, limit, ttl_s=2 * 86400):
        """Atomically add 1 to a counter unless it is already at limit. True if added."""
        with self._lock:
            n, exp = self._counters.get(key, (0, 0))
            if exp <= self._now():
                n = 0
            if n >= limit:
                return False
            self._counters[key] = (n + 1, self._now() + ttl_s)
            return True

    def count(self, key):
        with self._lock:
            n, exp = self._counters.get(key, (0, 0))
            return n if exp > self._now() else 0


class DynamoStore:
    """client: a boto3 DynamoDB low-level client (or anything with get_item/put_item/update_item)."""

    def __init__(self, client, table, clock=time.time):
        self._c, self._t, self._now = client, table, clock

    def _is(self, e, code):
        return getattr(e, "response", {}).get("Error", {}).get("Code") == code

    def get(self, pk):
        r = self._c.get_item(TableName=self._t, Key={"pk": {"S": pk}}, ConsistentRead=True)
        it = r.get("Item")
        if not it or int(it["ttl"]["N"]) <= self._now():  # TTL deletion can lag by up to days; enforce it here
            return None
        return Item(json.loads(it["data"]["S"]), int(it["version"]["N"]), float(it["lease_until"]["N"]))

    def put(self, pk, data, expected_version=None, lease_until=0.0):
        item = {"pk": {"S": pk}, "data": {"S": json.dumps(data)},
                "version": {"N": str((expected_version or 0) + 1)},
                "lease_until": {"N": repr(float(lease_until))},
                "ttl": {"N": str(int(self._now()) + SESSION_TTL_S)}}
        if expected_version is None:  # also replaces an expired-but-not-yet-deleted item
            cond, vals = "attribute_not_exists(pk) OR #t <= :now", {":now": {"N": str(int(self._now()))}}
        else:
            cond, vals = "version = :ev AND #t > :now", {":ev": {"N": str(expected_version)},
                                                         ":now": {"N": str(int(self._now()))}}
        try:
            self._c.put_item(TableName=self._t, Item=item, ConditionExpression=cond,
                             ExpressionAttributeNames={"#t": "ttl"}, ExpressionAttributeValues=vals)
        except Exception as e:
            if self._is(e, "ConditionalCheckFailedException"):
                raise Conflict(pk) from e
            raise
        return int(item["version"]["N"])

    def incr_if_below(self, key, limit, ttl_s=2 * 86400):
        try:
            self._c.update_item(
                TableName=self._t, Key={"pk": {"S": key}},
                UpdateExpression="ADD n :one SET #t = :exp",
                ConditionExpression="attribute_not_exists(n) OR n < :limit",
                ExpressionAttributeNames={"#t": "ttl"},
                ExpressionAttributeValues={":one": {"N": "1"}, ":limit": {"N": str(int(limit))},
                                           ":exp": {"N": str(int(self._now()) + ttl_s)}})
            return True
        except Exception as e:
            if self._is(e, "ConditionalCheckFailedException"):
                return False
            raise

    def count(self, key):
        it = self._c.get_item(TableName=self._t, Key={"pk": {"S": key}}, ConsistentRead=True).get("Item")
        return int(it["n"]["N"]) if it and "n" in it else 0


def make_store():
    kind = os.environ.get("INTERLOCK_STORE", "memory").strip().lower()
    if kind == "memory":
        return MemoryStore()
    if kind == "dynamodb":
        import boto3  # lazy: local runs and tests never need it
        table = os.environ["INTERLOCK_TABLE"]
        return DynamoStore(boto3.client("dynamodb", endpoint_url=os.environ.get("DYNAMODB_ENDPOINT") or None), table)
    raise RuntimeError(f"INTERLOCK_STORE must be 'memory' or 'dynamodb', got {kind!r}")


def begin_turn(store, pk, now=time.time, lease_s=LEASE_S):
    """Take the session lease. Returns the Item (with the new version) or raises Busy / Conflict."""
    it = store.get(pk)
    if it is None:
        raise KeyError(pk)
    if it.lease_until > now():
        raise Busy(pk)
    v = store.put(pk, it.data, it.version, lease_until=now() + lease_s)
    return Item(it.data, v, now() + lease_s)


def end_turn(store, pk, item, data):
    """Write the turn's result and drop the lease. Raises Conflict if the lease was lost."""
    return store.put(pk, data, item.version, lease_until=0.0)


def daily_key(prefix="cap", now=time.time):
    return f"{prefix}#{time.strftime('%Y-%m-%d', time.gmtime(now()))}"
