export function CompareInsightSkeleton() {
  return (
    <div className="cmp-insight cmp-insight-skeleton">
      <div className="cmp-insight-label">תובנה</div>
      <div className="v2-ai-skeleton-line" style={{ width: "100%" }} />
      <div className="v2-ai-skeleton-line" style={{ width: "85%" }} />
      <div className="v2-ai-skeleton-line" style={{ width: "68%" }} />
    </div>
  );
}

export function CompareInsightContent({ text }: { text: string }) {
  return (
    <div className="cmp-insight">
      <div className="cmp-insight-label">תובנה</div>
      <p className="cmp-insight-text">{text}</p>
    </div>
  );
}
