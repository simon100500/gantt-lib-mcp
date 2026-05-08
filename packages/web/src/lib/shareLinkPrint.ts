import * as QRCode from 'qrcode';

interface PrintShareLinkSheetOptions {
  shareUrl: string;
  projectName: string;
  logoUrl: string;
  serviceName: string;
  descriptor: string;
  details: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildPrintMarkup({
  qrDataUrl,
  projectName,
  logoUrl,
  serviceName,
  descriptor,
  details,
}: PrintShareLinkSheetOptions & { qrDataUrl: string }): string {
  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(projectName)} - QR</title>
    <style>
      @page {
        size: A4 portrait;
        margin: 0;
      }

      * {
        box-sizing: border-box;
      }

      html, body {
        margin: 0;
        padding: 0;
        background: #e2e8f0;
        color: #0f172a;
        font-family: Inter, Roboto, "Segoe UI", Arial, sans-serif;
      }

      body {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
      }

      .sheet {
        width: 210mm;
        height: 297mm;
        background: #ffffff;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        padding: 16mm 18mm 12mm;
      }

      .content {
        flex: 1 1 auto;
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        min-height: 0;
        padding-top: 10mm;
      }

      .eyebrow {
        margin: 0;
        text-align: center;
        font-size: 15pt;
        line-height: 1.3;
        font-weight: 500;
        color: #475569;
        word-break: break-word;
      }

      .title {
        margin: 4mm 0 0;
        text-align: center;
        font-size: 24pt;
        line-height: 1.15;
        font-weight: 700;
        word-break: break-word;
      }

      .qr-wrap {
        margin: 10mm auto 0;
        width: min(100%, 108mm);
        padding: 6mm;
        border: 1px solid #dbe3ef;
        border-radius: 8mm;
      }

      .qr {
        display: block;
        width: 100%;
        max-width: 96mm;
        aspect-ratio: 1;
        height: auto;
        margin: 0 auto;
      }

      .hint {
        margin: 4mm auto 0;
        max-width: 150mm;
        text-align: center;
        font-size: 10.5pt;
        line-height: 1.4;
        color: #64748b;
        word-break: break-word;
      }

      .footer {
        margin-top: auto;
        padding-top: 6mm;
        border-top: 1px solid #e2e8f0;
        display: flex;
        align-items: center;
        gap: 4mm;
        page-break-inside: avoid;
      }

      .logo {
        width: 14mm;
        height: 14mm;
        object-fit: contain;
        flex: 0 0 auto;
      }

      .brand {
        min-width: 0;
      }

      .service {
        font-size: 12pt;
        font-weight: 700;
        line-height: 1.2;
      }

      .descriptor {
        margin-top: 1mm;
        font-size: 10pt;
        line-height: 1.35;
        color: #64748b;
      }

      @media screen {
        .sheet {
          box-shadow: 0 18px 60px rgba(15, 23, 42, 0.16);
        }
      }

      @media print {
        html, body {
          width: 210mm;
          height: 297mm;
          background: #ffffff;
        }

        body {
          display: block;
          padding: 0;
        }

        .sheet {
          margin: 0;
          box-shadow: none;
        }
      }
    </style>
  </head>
  <body>
    <main class="sheet">
      <p class="eyebrow">${escapeHtml(projectName)}</p>
      <h1 class="title">График производства работ</h1>
      <div class="content">
        <div class="qr-wrap">
          <img class="qr" src="${qrDataUrl}" alt="QR-код для открытия графика" />
        </div>
        <p class="hint">${escapeHtml(details)}</p>
      </div>
      <footer class="footer">
        <img class="logo" src="${logoUrl}" alt="" />
        <div class="brand">
          <div class="service">${escapeHtml(serviceName)}</div>
          <div class="descriptor">${escapeHtml(descriptor)}</div>
        </div>
      </footer>
    </main>
  </body>
</html>`;
}

export async function printShareLinkSheet(options: PrintShareLinkSheetOptions): Promise<void> {
  const qrDataUrl = await QRCode.toDataURL(options.shareUrl, {
    errorCorrectionLevel: 'H',
    margin: 1,
    width: 1200,
    color: {
      dark: '#0f172aff',
      light: '#ffffffff',
    },
  });

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';

  const cleanup = () => {
    iframe.remove();
  };
  let printTriggered = false;

  iframe.onload = () => {
    if (printTriggered) {
      return;
    }

    const frameWindow = iframe.contentWindow;
    if (!frameWindow) {
      cleanup();
      return;
    }

    printTriggered = true;

    const handleAfterPrint = () => {
      frameWindow.removeEventListener('afterprint', handleAfterPrint);
      window.setTimeout(cleanup, 150);
    };

    frameWindow.addEventListener('afterprint', handleAfterPrint);
    window.setTimeout(() => {
      frameWindow.focus();
      frameWindow.print();
    }, 150);
  };

  document.body.append(iframe);

  const frameDocument = iframe.contentDocument;
  if (!frameDocument) {
    cleanup();
    throw new Error('Не удалось подготовить страницу печати.');
  }

  frameDocument.open();
  frameDocument.write(buildPrintMarkup({ ...options, qrDataUrl }));
  frameDocument.close();
}
