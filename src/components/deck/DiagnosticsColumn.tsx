import { DiagnosticsPanel } from "./DiagnosticsPanel";

type DiagnosticsColumnProps = { did: string; onClose?: () => void };

export function DiagnosticsColumn(props: DiagnosticsColumnProps) {
  return <DiagnosticsPanel did={props.did} onClose={props.onClose ?? (() => void 0)} />;
}
