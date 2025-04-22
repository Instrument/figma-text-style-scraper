"use strict";
/// <reference types="@figma/plugin-typings" />
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
// Function to extract style properties from a text node
function extractTextStyle(node) {
    return __awaiter(this, void 0, void 0, function* () {
        const styles = [];
        // Get all styled segments of the text
        const segments = node.getStyledTextSegments([
            "fontName",
            "fontSize",
            "fontWeight",
        ]);
        for (const segment of segments) {
            // Load the font if needed
            yield figma.loadFontAsync(segment.fontName);
            styles.push({
                family: segment.fontName.family,
                size: segment.fontSize,
                weight: segment.fontWeight,
                preview: segment.characters.slice(0, 10), // Take first 10 chars for preview
            });
        }
        return styles;
    });
}
// Function to scan all text nodes on the current page
function scanTextStyles() {
    return __awaiter(this, void 0, void 0, function* () {
        const textNodes = figma.currentPage.findAll((node) => node.type === "TEXT");
        const allStyles = [];
        for (const node of textNodes) {
            const nodeStyles = yield extractTextStyle(node);
            allStyles.push(...nodeStyles);
        }
        // Remove duplicates and sort by size
        const uniqueStyles = Array.from(new Map(allStyles.map((style) => [
            `${style.family}-${style.size}-${style.weight}`,
            style,
        ])).values()).sort((a, b) => b.size - a.size);
        return uniqueStyles;
    });
}
// This shows the HTML page in "ui.html".
figma.showUI(__html__, { width: 400, height: 600 });
// Send initial scan results to UI
scanTextStyles().then((styles) => {
    figma.ui.postMessage({ type: "styles", data: styles });
});
// Handle messages from UI
figma.ui.onmessage = (msg) => {
    if (msg.type === "refresh") {
        scanTextStyles().then((styles) => {
            figma.ui.postMessage({ type: "styles", data: styles });
        });
    }
    // Make sure to close the plugin when you're done. Otherwise the plugin will
    // keep running, which shows the cancel button at the bottom of the screen.
    figma.closePlugin();
};
