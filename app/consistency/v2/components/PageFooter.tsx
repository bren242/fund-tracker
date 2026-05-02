export default function PageFooter({ disclaimer }: { disclaimer?: string }) {
  return (
    <div className="v2-page-footer">
      {disclaimer && <div className="v2-disclaimer">{disclaimer}</div>}
      <div className="v2-brand-line">GREEN Wealth Management · greenwm.co.il</div>
    </div>
  );
}
