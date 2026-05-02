// Wraps standalone numbers (with optional %) in <span class="num"> for gold highlight
const NUM_RE = /(?<![^\s,.(;\-״"(])(-?\d+(?:\.\d+)?(?:%|(?=[\s,.;:)—״"\n]|$)))/gu;

function HighlightedParagraph({ text }: { text: string }) {
  const parts = text.split(NUM_RE);
  return (
    <p>
      {parts.map((part, i) =>
        /^-?\d+(?:\.\d+)?%?$/.test(part) ? (
          <span key={i} className="num">{part}</span>
        ) : (
          part
        )
      )}
    </p>
  );
}

export default function StoryProse({ paragraphs }: { paragraphs: string[] }) {
  if (!paragraphs?.length) return null;
  return (
    <div className="v2-story-prose">
      {paragraphs.map((p, i) => (
        <HighlightedParagraph key={i} text={p} />
      ))}
    </div>
  );
}
