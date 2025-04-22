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
  isMissingFont: boolean;
  instances: number;
}

interface FontFamily {
  name: string;
  styles: TextStyleInfo[];
  isMissingFont: boolean;
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
    // Check if the font is missing
    const isMissingFont = node.hasMissingFont;

    styles.push({
      family: segment.fontName.family,
      size: segment.fontSize,
      weight: segment.fontWeight,
      preview: segment.characters.slice(0, 10), // Take first 10 chars for preview
      isMissingFont: isMissingFont,
      instances: 1,
    });
  }

  return styles;
}

// Function to scan text nodes from a specific node or the entire page
async function scanTextStyles(): Promise<FontFamily[]> {
  let textNodes: TextNode[] = [];

  // Check if there are any selected nodes
  const selectedNodes = figma.currentPage.selection;

  if (selectedNodes.length > 0) {
    // If there are selected nodes, find all text nodes within them
    for (const node of selectedNodes) {
      if (node.type === "TEXT") {
        textNodes.push(node);
      } else if ("children" in node) {
        const childTextNodes = node.findAll(
          (child) => child.type === "TEXT"
        ) as TextNode[];
        textNodes.push(...childTextNodes);
      }
    }
  } else {
    // If no selection, scan the entire page
    textNodes = figma.currentPage.findAll(
      (node) => node.type === "TEXT"
    ) as TextNode[];
  }

  const allStyles: TextStyleInfo[] = [];

  for (const node of textNodes) {
    const nodeStyles = await extractTextStyle(node);
    allStyles.push(...nodeStyles);
  }

  // Group styles by family and size
  const styleMap = new Map<string, TextStyleInfo>();

  allStyles.forEach((style) => {
    const key = `${style.family}-${style.size}-${style.weight}`;
    if (styleMap.has(key)) {
      const existingStyle = styleMap.get(key)!;
      existingStyle.instances++;
    } else {
      styleMap.set(key, { ...style });
    }
  });

  // Group by family
  const familyMap = new Map<string, FontFamily>();

  Array.from(styleMap.values()).forEach((style) => {
    if (!familyMap.has(style.family)) {
      familyMap.set(style.family, {
        name: style.family,
        styles: [],
        isMissingFont: style.isMissingFont,
      });
    }
    familyMap.get(style.family)!.styles.push(style);
  });

  // Convert to array and sort styles by size
  const fontFamilies = Array.from(familyMap.values());
  fontFamilies.forEach((family) => {
    family.styles.sort((a, b) => a.size - b.size);
  });

  // Sort families alphabetically
  return fontFamilies.sort((a, b) => a.name.localeCompare(b.name));
}

// This shows the HTML page in "ui.html".
figma.showUI(__html__, { width: 400, height: 600 });

// Send initial scan results to UI
scanTextStyles().then((fontFamilies) => {
  figma.ui.postMessage({
    type: "styles",
    data: fontFamilies,
    selectionInfo:
      figma.currentPage.selection.length > 0
        ? `Scanning ${figma.currentPage.selection.length} selected node(s)`
        : "Scanning entire page",
  });
});

// Handle messages from UI
figma.ui.onmessage = (msg: { type: string }) => {
  if (msg.type === "refresh") {
    scanTextStyles().then((fontFamilies) => {
      figma.ui.postMessage({
        type: "styles",
        data: fontFamilies,
        selectionInfo:
          figma.currentPage.selection.length > 0
            ? `Scanning ${figma.currentPage.selection.length} selected node(s)`
            : "Scanning entire page",
      });
    });
  }

  // Make sure to close the plugin when you're done. Otherwise the plugin will
  // keep running, which shows the cancel button at the bottom of the screen.
  figma.closePlugin();
};
