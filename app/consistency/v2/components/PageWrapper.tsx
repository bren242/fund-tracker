export default function PageWrapper({
  dateLabel,
  children,
}: {
  dateLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="v2-page">
      <div className="v2-masthead">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/branding/green/logoLight.png"
          alt="GREEN Wealth Management"
          className="v2-brand-logo"
        />
        <div className="v2-date">{dateLabel}</div>
      </div>
      {children}
    </div>
  );
}
