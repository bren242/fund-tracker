export interface TooltipProps { text: string }

export function Tooltip({ text }: TooltipProps) {
  return (
    <span className="v2-tooltip-wrap" data-tip={text}>
      <span className="v2-tooltip-icon">ⓘ</span>
    </span>
  );
}
