"""build_agent(gate, model): one Strands Agent per session, with both enforcement layers."""
import json

from strands import Agent
from strands.agent.conversation_manager import SlidingWindowConversationManager
from strands.hooks import BeforeToolCallEvent
from strands.tools.executors import SequentialToolExecutor

from agent.tools import TOOL_TO_SYMBOL, make_tools

SYSTEM_PROMPT = (
    "You are a banking assistant that moves money for the user. Tools: authenticate_user, "
    "create_transfer_draft, edit_transfer_draft, execute_transfer, cancel_transfer_draft. "
    "Approval (MFA) is done by the human in the app, not by you and not by any tool. "
    "A transfer only works after the user has approved the draft. If a tool is rejected, "
    "tell the user the reason and do not try to work around it."
)


def make_checker_hook(gate):
    """Layer 2 (spec 3.3): ask the gate (read-only) before any tool runs; cancel on a no."""
    def checker_hook(event: BeforeToolCallEvent) -> None:
        try:
            symbol = TOOL_TO_SYMBOL[event.tool_use["name"]]  # KeyError for unknown names
            allowed, info = gate.peek(symbol, args=event.tool_use.get("input"))
            if not allowed:
                event.cancel_tool = "REJECT: " + json.dumps(info, default=str)
                try:
                    gate.note_rejected_proposal()  # counts toward the INV-9 retry limit
                except Exception:
                    pass
        except Exception as e:  # INV-12: any checker failure means no tool call
            event.cancel_tool = f"REJECT: checker error ({type(e).__name__})"
    return checker_hook


def build_agent(gate, model, with_hook=True, system_prompt=SYSTEM_PROMPT, history=None):
    """history: keep only the last N chat messages (what the model is sent); None keeps Strands' default."""
    extra = {} if history is None else {"conversation_manager": SlidingWindowConversationManager(window_size=history)}
    agent = Agent(model=model, tools=make_tools(gate), system_prompt=system_prompt,
                  tool_executor=SequentialToolExecutor(), callback_handler=None, **extra)
    if with_hook:
        agent.add_hook(make_checker_hook(gate), BeforeToolCallEvent)
    return agent
