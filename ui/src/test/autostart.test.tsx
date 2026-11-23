import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AutoStart } from "../components/AutoStart";

describe("AutoStart prompt", () => {
  it("starts with the typed code, only when there is one", () => {
    const onStart = vi.fn();
    render(<AutoStart onStart={onStart} onCancel={() => {}} />);
    const go = screen.getByRole("button", { name: "Start with the human key" });
    expect(go).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Demo code"), { target: { value: "x-code" } });
    fireEvent.click(go);
    expect(onStart).toHaveBeenCalledWith("x-code");
  });
  it("offers to skip the human step, which sends no code", () => {
    const onStart = vi.fn();
    render(<AutoStart onStart={onStart} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Skip the human step" }));
    expect(onStart).toHaveBeenCalledWith(null);
  });
});