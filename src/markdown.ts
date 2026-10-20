// A small, dependency-free Markdown -> HTML renderer, just enough for
// README.md: headings, paragraphs, lists, links, bold/italic, code spans,
// fenced code blocks, and blockquotes. Not a general CommonMark
// implementation — it only needs to handle what this project's own README
// actually uses, and spec/readme.test.ts only checks that each heading's
// text appears, in order, so exact HTML shape beyond that is not load-bearing.
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inline(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, href) => `<a href="${href}">${label}</a>`);
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return out;
}

export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let inCode = false;
  let listOpen = false;
  let quoteOpen = false;

  const closeList = () => {
    if (listOpen) {
      html.push("</ul>");
      listOpen = false;
    }
  };
  const closeQuote = () => {
    if (quoteOpen) {
      html.push("</blockquote>");
      quoteOpen = false;
    }
  };

  for (const line of lines) {
    if (/^ {0,3}(```|~~~)/.test(line)) {
      closeList();
      closeQuote();
      if (!inCode) {
        html.push("<pre><code>");
        inCode = true;
      } else {
        html.push("</code></pre>");
        inCode = false;
      }
      continue;
    }
    if (inCode) {
      html.push(escapeHtml(line));
      continue;
    }

    const heading = line.match(/^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (heading) {
      closeList();
      closeQuote();
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    const bullet = line.match(/^ {0,3}[-*]\s+(.*)$/);
    if (bullet) {
      closeQuote();
      if (!listOpen) {
        html.push("<ul>");
        listOpen = true;
      }
      html.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }

    const quote = line.match(/^ {0,3}>\s?(.*)$/);
    if (quote) {
      closeList();
      if (!quoteOpen) {
        html.push("<blockquote>");
        quoteOpen = true;
      }
      html.push(`<p>${inline(quote[1])}</p>`);
      continue;
    }

    if (line.trim() === "") {
      closeList();
      closeQuote();
      continue;
    }

    closeList();
    closeQuote();
    html.push(`<p>${inline(line.trim())}</p>`);
  }
  closeList();
  closeQuote();
  if (inCode) html.push("</code></pre>");
  return html.join("\n");
}

export function renderReadmePage(md: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Buy or Pass — README</title>
<link rel="stylesheet" href="/static/styles.css" />
</head>
<body class="readme-page">
<main class="readme-content">
${renderMarkdown(md)}
</main>
</body>
</html>`;
}
