/// <reference types="@figma/plugin-typings" />

// This plugin will open a window to prompt the user to enter a number, and
// it will then create that many rectangles on the screen.

// This file holds the main code for plugins. Code in this file has access to
// the *figma document* via the figma global object.
// You can access browser APIs in the <script> tag inside "ui.html" which has a
// full browser environment (See https://www.figma.com/plugin-docs/how-plugins-run).

interface TextStyleInfo {
  family: string;
  size: number;
  weight: number;
  preview: string;
}

// Function to extract style properties from a text node
async function extractTextStyle(node: TextNode): Promise<TextStyleInfo[]> {
  const styles: TextStyleInfo[] = [];

  // Get all styled segments of the text
  const segments = node.getStyledTextSegments([
    "fontName",
    "fontSize",
    "fontWeight",
  ]);

  for (const segment of segments) {
    // Load the font if needed
    await figma.loadFontAsync(segment.fontName);

    styles.push({
      family: segment.fontName.family,
      size: segment.fontSize,
      weight: segment.fontWeight,
      preview: segment.characters.slice(0, 10), // Take first 10 chars for preview
    });
  }

  return styles;
}

// Function to scan all text nodes on the current page
async function scanTextStyles(): Promise<TextStyleInfo[]> {
  const textNodes = figma.currentPage.findAll(
    (node) => node.type === "TEXT"
  ) as TextNode[];
  const allStyles: TextStyleInfo[] = [];

  for (const node of textNodes) {
    const nodeStyles = await extractTextStyle(node);
    allStyles.push(...nodeStyles);
  }

  // Remove duplicates and sort by size
  const uniqueStyles = Array.from(
    new Map(
      allStyles.map((style) => [
        `${style.family}-${style.size}-${style.weight}`,
        style,
      ])
    ).values()
  ).sort((a, b) => b.size - a.size);

  return uniqueStyles;
}

// This shows the HTML page in "ui.html".
figma.showUI(__html__, { width: 400, height: 600 });

// Send initial scan results to UI
scanTextStyles().then((styles) => {
  figma.ui.postMessage({ type: "styles", data: styles });
});

// Handle messages from UI
figma.ui.onmessage = (msg: { type: string }) => {
  if (msg.type === "refresh") {
    scanTextStyles().then((styles) => {
      figma.ui.postMessage({ type: "styles", data: styles });
    });
  }

  // Make sure to close the plugin when you're done. Otherwise the plugin will
  // keep running, which shows the cancel button at the bottom of the screen.
  figma.closePlugin();
};
