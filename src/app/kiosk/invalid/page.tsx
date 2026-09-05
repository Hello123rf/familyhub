export default function KioskInvalidPage() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Kiosk Link Invalid</title>
        <style>{`
          body { font-family: Georgia, serif; background: #fff; color: #000; padding: 40px 20px; max-width: 500px; margin: 0 auto; }
          h1 { font-size: 1.5rem; margin-bottom: 12px; }
          p { color: #555; }
        `}</style>
      </head>
      <body>
        <h1>🔗 Kiosk link not found</h1>
        <p>This link is no longer valid. Ask a parent to generate a new kiosk link from the Family Hub settings.</p>
      </body>
    </html>
  );
}
