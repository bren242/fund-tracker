export default function PageWrapper({
  dateLabel,
  children,
  idlePath,
}: {
  dateLabel: string;
  children: React.ReactNode;
  idlePath?: string;
}) {
  return (
    <div className="v2-page">
      <div className="v2-masthead">
        {idlePath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <a href={idlePath} className="v2-logo-link">
            <img
              src="/branding/green/logoLight.png"
              alt="GREEN Wealth Management"
              className="v2-brand-logo"
            />
          </a>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/branding/green/logoLight.png"
            alt="GREEN Wealth Management"
            className="v2-brand-logo"
          />
        )}
        <div className="v2-date">{dateLabel}</div>
      </div>
      {children}
    </div>
  );
}
