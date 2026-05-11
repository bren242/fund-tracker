export default function PageWrapper({
  dateLabel,
  children,
  idlePath,
  client = "green",
}: {
  dateLabel: string;
  children: React.ReactNode;
  idlePath?: string;
  client?: string;
}) {
  const logoSrc = `/branding/${client}/logoLight.png`;
  const logoAlt = client === "green" ? "GREEN Wealth Management" : client.toUpperCase();

  return (
    <div className="v2-page">
      <div className="v2-masthead">
        {idlePath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <a href={idlePath} className="v2-logo-link">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoSrc} alt={logoAlt} className="v2-brand-logo" />
          </a>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoSrc} alt={logoAlt} className="v2-brand-logo" />
        )}
        <div className="v2-date">{dateLabel}</div>
      </div>
      {children}
    </div>
  );
}
