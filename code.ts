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
  lineHeight: string | undefined;
  letterSpacing: string | undefined;
  nodeIds: string[];
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
    "lineHeight",
    "letterSpacing",
  ]);

  for (const segment of segments) {
    // Check if the font is missing
    const isMissingFont = node.hasMissingFont;

    // Format line height
    let lineHeight: string | undefined = undefined;
    if (segment.lineHeight && typeof segment.lineHeight !== "symbol") {
      if (segment.lineHeight.unit === "PIXELS") {
        lineHeight = `${segment.lineHeight.value}px`;
      } else if (segment.lineHeight.unit === "PERCENT") {
        lineHeight = `${segment.lineHeight.value}%`;
      }
    }

    // Format letter spacing
    let letterSpacing: string | undefined = undefined;
    if (segment.letterSpacing && typeof segment.letterSpacing !== "symbol") {
      letterSpacing = `${segment.letterSpacing.value}px`;
    }

    const existingStyle = styles.find(
      (s) =>
        s.family === segment.fontName.family &&
        s.size === segment.fontSize &&
        s.weight === segment.fontWeight
    );

    if (existingStyle) {
      existingStyle.instances++;
      existingStyle.nodeIds.push(node.id);
    } else {
      styles.push({
        family: segment.fontName.family,
        size: segment.fontSize,
        weight: segment.fontWeight,
        preview: segment.characters.slice(0, 10),
        isMissingFont: isMissingFont,
        instances: 1,
        lineHeight,
        letterSpacing,
        nodeIds: [node.id],
      });
    }
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
      existingStyle.nodeIds.push(...style.nodeIds);
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
    family.styles.sort((a, b) => b.size - a.size); // Sort by size descending
  });

  // Sort families alphabetically
  return fontFamilies.sort((a, b) => a.name.localeCompare(b.name));
}

// Function to select and zoom to nodes
async function selectAndZoomToNodes(nodeIds: string[]) {
  // Get all the nodes
  const nodes = await Promise.all(
    nodeIds.map((id) => figma.getNodeByIdAsync(id))
  );
  const textNodes = nodes.filter(
    (node): node is TextNode => node !== null && node.type === "TEXT"
  );

  if (textNodes.length === 0) return;

  // Select all the nodes
  figma.currentPage.selection = textNodes;

  // Calculate the bounding box that contains all nodes
  const bounds = textNodes.reduce(
    (acc, node) => {
      const nodeBounds = node.absoluteBoundingBox!;
      if (!acc) return nodeBounds;
      return {
        x: Math.min(acc.x, nodeBounds.x),
        y: Math.min(acc.y, nodeBounds.y),
        width:
          Math.max(acc.x + acc.width, nodeBounds.x + nodeBounds.width) -
          Math.min(acc.x, nodeBounds.x),
        height:
          Math.max(acc.y + acc.height, nodeBounds.y + nodeBounds.height) -
          Math.min(acc.y, nodeBounds.y),
      };
    },
    null as null | { x: number; y: number; width: number; height: number }
  );

  if (bounds) {
    // Add some padding around the selection
    const padding = 100;

    // Create a frame to zoom to (will be removed immediately)
    const frame = figma.createFrame();
    frame.resize(bounds.width + padding * 2, bounds.height + padding * 2);
    frame.x = bounds.x - padding;
    frame.y = bounds.y - padding;

    // Zoom to the frame
    figma.viewport.scrollAndZoomIntoView([frame]);

    // Remove the temporary frame
    frame.remove();
  }
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
figma.ui.onmessage = (msg: { type: string; nodeIds?: string[] }) => {
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
  } else if (msg.type === "select" && msg.nodeIds) {
    selectAndZoomToNodes(msg.nodeIds);
  }

  // Don't close the plugin anymore when receiving messages
  // Only close when explicitly requested
  if (msg.type === "close") {
    figma.closePlugin();
  }
};
