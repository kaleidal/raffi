const hasHtmlTags = (value: string) => /<[a-z][\s\S]*>/i.test(value);

const escapeHtml = (value: string) =>
    value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

const sanitizeUrl = (url: string) => {
    const trimmed = url.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return "#";
};

const BLOCKED_HTML_TAGS = new Set([
    "script",
    "style",
    "iframe",
    "object",
    "embed",
    "link",
    "meta",
]);

const ALLOWED_HTML_TAGS = new Set([
    "a",
    "p",
    "br",
    "ul",
    "ol",
    "li",
    "blockquote",
    "hr",
    "strong",
    "em",
    "code",
    "pre",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
]);

const sanitizeHtmlElement = (
    element: Element,
    doc: Document,
): Node | DocumentFragment | null => {
    const tagName = element.tagName.toLowerCase();

    if (BLOCKED_HTML_TAGS.has(tagName)) {
        return null;
    }

    if (!ALLOWED_HTML_TAGS.has(tagName)) {
        const fragment = doc.createDocumentFragment();
        for (const child of Array.from(element.childNodes)) {
            const next = sanitizeHtmlNode(child, doc);
            if (next) fragment.appendChild(next);
        }
        return fragment;
    }

    const cleanElement = doc.createElement(tagName);
    if (tagName === "a") {
        const href = element.getAttribute("href");
        cleanElement.setAttribute("href", sanitizeUrl(href || "#"));
        cleanElement.setAttribute("target", "_blank");
        cleanElement.setAttribute("rel", "noreferrer noopener");
    }

    for (const child of Array.from(element.childNodes)) {
        const next = sanitizeHtmlNode(child, doc);
        if (next) cleanElement.appendChild(next);
    }

    return cleanElement;
};

const sanitizeHtmlNode = (
    node: Node,
    doc: Document,
): Node | DocumentFragment | null => {
    if (node.nodeType === Node.TEXT_NODE) {
        return doc.createTextNode(node.textContent || "");
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
        return null;
    }

    return sanitizeHtmlElement(node as Element, doc);
};

const formatInlineMarkdown = (value: string) => {
    let output = escapeHtml(value);

    output = output.replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        (_match, label: string, rawUrl: string) =>
            `<a href="${sanitizeUrl(rawUrl)}" target="_blank" rel="noreferrer noopener">${escapeHtml(label)}</a>`,
    );
    output = output.replace(/`([^`]+)`/g, "<code>$1</code>");
    output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    output = output.replace(/\*([^*]+)\*/g, "<em>$1</em>");

    return output;
};

const sanitizeHtmlNotes = (value: string) => {
    if (typeof DOMParser === "undefined" || typeof document === "undefined") {
        return escapeHtml(value);
    }

    const parsed = new DOMParser().parseFromString(value, "text/html");
    const container = document.createElement("div");

    for (const child of Array.from(parsed.body.childNodes)) {
        const cleanNode = sanitizeHtmlNode(child, document);
        if (cleanNode) container.appendChild(cleanNode);
    }

    return container.innerHTML;
};

const markdownToHtml = (value: string) => {
    const lines = value.replace(/\r\n/g, "\n").split("\n");
    const html: string[] = [];
    const paragraph: string[] = [];
    let inUnorderedList = false;
    let inOrderedList = false;

    const closeLists = () => {
        if (inUnorderedList) {
            html.push("</ul>");
            inUnorderedList = false;
        }
        if (inOrderedList) {
            html.push("</ol>");
            inOrderedList = false;
        }
    };

    const flushParagraph = () => {
        if (paragraph.length === 0) return;
        html.push(`<p>${formatInlineMarkdown(paragraph.join(" "))}</p>`);
        paragraph.length = 0;
    };

    for (const rawLine of lines) {
        const line = rawLine.trim();

        if (!line) {
            flushParagraph();
            closeLists();
            continue;
        }

        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
            flushParagraph();
            closeLists();
            const level = Math.min(6, headingMatch[1].length);
            html.push(`<h${level}>${formatInlineMarkdown(headingMatch[2])}</h${level}>`);
            continue;
        }

        if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
            flushParagraph();
            closeLists();
            html.push("<hr />");
            continue;
        }

        const unorderedMatch = line.match(/^[-*+]\s+(.+)$/);
        if (unorderedMatch) {
            flushParagraph();
            if (inOrderedList) {
                html.push("</ol>");
                inOrderedList = false;
            }
            if (!inUnorderedList) {
                html.push("<ul>");
                inUnorderedList = true;
            }
            html.push(`<li>${formatInlineMarkdown(unorderedMatch[1])}</li>`);
            continue;
        }

        const orderedMatch = line.match(/^\d+\.\s+(.+)$/);
        if (orderedMatch) {
            flushParagraph();
            if (inUnorderedList) {
                html.push("</ul>");
                inUnorderedList = false;
            }
            if (!inOrderedList) {
                html.push("<ol>");
                inOrderedList = true;
            }
            html.push(`<li>${formatInlineMarkdown(orderedMatch[1])}</li>`);
            continue;
        }

        const quoteMatch = line.match(/^>\s?(.+)$/);
        if (quoteMatch) {
            flushParagraph();
            closeLists();
            html.push(`<blockquote>${formatInlineMarkdown(quoteMatch[1])}</blockquote>`);
            continue;
        }

        paragraph.push(line);
    }

    flushParagraph();
    closeLists();

    return html.join("\n");
};

export const formatReleaseNotes = (notes: string) => {
    const trimmed = String(notes || "").trim();
    if (!trimmed) return "";
    if (hasHtmlTags(trimmed)) return sanitizeHtmlNotes(trimmed);
    return markdownToHtml(trimmed);
};
