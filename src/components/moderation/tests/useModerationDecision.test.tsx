import type { ModerationLabel } from "$/lib/types";
import { render, waitFor } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useModerationDecision } from "../hooks/useModerationDecision";

const moderateContentMock = vi.hoisted(() => vi.fn());

vi.mock("$/lib/api/moderation", () => ({ ModerationController: { moderateContent: moderateContentMock } }));

function DecisionProbe(props: { context: "contentList" | "contentMedia"; labels: ModerationLabel[] }) {
  const labels = () => props.labels;
  const ctx = () => props.context;
  const decision = useModerationDecision(labels, ctx());
  return <span>{decision().blur}</span>;
}

describe("useModerationDecision", () => {
  beforeEach(() => {
    moderateContentMock.mockReset();
    moderateContentMock.mockResolvedValue({
      alert: false,
      blur: "none",
      filter: false,
      inform: false,
      noOverride: false,
    });
  });

  it("includes context in its cache key", async () => {
    const labels: ModerationLabel[] = [{ src: "did:plc:labeler", val: "warn", uri: "at://did:plc:alice/app.test/1" }];

    const first = render(() => <DecisionProbe context="contentList" labels={labels} />);
    await waitFor(() => expect(moderateContentMock).toHaveBeenCalledWith(labels, "contentList"));
    expect(moderateContentMock).toHaveBeenCalledTimes(1);
    first.unmount();

    const second = render(() => <DecisionProbe context="contentList" labels={labels} />);
    await waitFor(() => expect(moderateContentMock).toHaveBeenCalledTimes(1));
    second.unmount();

    render(() => <DecisionProbe context="contentMedia" labels={labels} />);
    await waitFor(() => expect(moderateContentMock).toHaveBeenCalledWith(labels, "contentMedia"));
    expect(moderateContentMock).toHaveBeenCalledTimes(2);
  });
});
