"""Spec 3.5 hello world: a Strands Agent on Bedrock, then one trivial @tool the model calls.
Run: .venv\\Scripts\\python scripts\\strands_hello.py   (uses about 3 Bedrock calls)"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from strands import Agent, tool  # noqa: E402

from agent.bedrock import count_model_calls, make_bedrock_model  # noqa: E402


@tool
def add_numbers(a: int, b: int) -> int:
    """Add two integers and return the sum."""
    return a + b


if __name__ == "__main__":
    plain = Agent(model=make_bedrock_model(100), callback_handler=None,
                  system_prompt="Answer in one short sentence.")
    count_model_calls(plain, "hello:plain")
    print("PLAIN:", str(plain("What is the capital of France?")).strip())

    with_tool = Agent(model=make_bedrock_model(150), tools=[add_numbers], callback_handler=None,
                      system_prompt="Use the add_numbers tool for any addition. Answer briefly.")
    count_model_calls(with_tool, "hello:tool")
    answer = with_tool("What is 1234 plus 4321?")
    print("TOOL ANSWER:", str(answer).strip())
    called = [b["toolUse"]["name"] for m in with_tool.messages if m["role"] == "assistant"
              for b in m["content"] if "toolUse" in b]
    print("TOOLS CALLED BY MODEL:", called)
