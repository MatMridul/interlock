"""Real Bedrock model factory plus a call counter (cost cap: 25 invocations for the D4 item)."""
import os

import boto3
from strands.hooks import BeforeModelCallEvent
from strands.models import BedrockModel

DEFAULT_MODEL_ID = "global.amazon.nova-2-lite-v1:0"  # override: BEDROCK_MODEL_ID
DEFAULT_REGION = "ap-south-1"  # override: AWS_REGION. Haiku in ap-south-1 is blocked for this account
CALL_LOG = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        "scripts", "bedrock_calls.log")


def make_bedrock_model(max_tokens=300):
    """Model on Bedrock (Nova 2 Lite by default). Credentials come from boto3's own chain; none are read here."""
    session = boto3.Session(region_name=os.environ.get("AWS_REGION", DEFAULT_REGION))
    return BedrockModel(model_id=os.environ.get("BEDROCK_MODEL_ID", DEFAULT_MODEL_ID),
                        boto_session=session, max_tokens=max_tokens, temperature=0.2)


def count_model_calls(agent, label):
    """Append one line to CALL_LOG each time the agent is about to call the model."""
    def _count(event: BeforeModelCallEvent) -> None:
        with open(CALL_LOG, "a", encoding="utf-8") as f:
            f.write(label + "\n")
    agent.add_hook(_count, BeforeModelCallEvent)
