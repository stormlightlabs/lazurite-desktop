import { queueExplorerTarget } from "$/lib/explorer-navigation";
import { useNavigate } from "@solidjs/router";
import { DiagnosticsPanel } from "./DiagnosticsPanel";

type DiagnosticsColumnProps = { did: string; onClose?: () => void };

export function DiagnosticsColumn(props: DiagnosticsColumnProps) {
  const navigate = useNavigate();

  function handleOpenExplorerTarget(target: string) {
    queueExplorerTarget(target);
    void navigate("/explorer");
  }

  return (
    <DiagnosticsPanel
      did={props.did}
      onClose={props.onClose ?? (() => void 0)}
      onOpenExplorerTarget={handleOpenExplorerTarget} />
  );
}
