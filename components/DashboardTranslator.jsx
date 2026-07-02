"use client";

import { useEffect } from "react";
import { dashboardTranslations } from "../lib/translations";

const originalText = new WeakMap();

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const translateText = (text, dictionary) => {
  const exact = dictionary[text];
  if (exact) return exact;

  return Object.entries(dictionary)
    .filter(([source]) => source.length > 2)
    .sort((a, b) => b[0].length - a[0].length)
    .reduce((current, [source, replacement]) => {
      const pattern = source.includes(" ")
        ? new RegExp(escapeRegExp(source), "gi")
        : new RegExp(`\\b${escapeRegExp(source)}\\b`, "gi");
      return current.replace(pattern, replacement);
    }, text);
};

const applyTranslations = (language) => {
  const dictionary = dashboardTranslations[language] || {};
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];

  while (walker.nextNode()) nodes.push(walker.currentNode);

  nodes.forEach((node) => {
    if (!originalText.has(node)) originalText.set(node, node.nodeValue);
    const original = originalText.get(node);
    const trimmed = original.trim();
    if (!trimmed) return;
    const nextValue = original.replace(trimmed, translateText(trimmed, dictionary));
    if (node.nodeValue !== nextValue) {
      node.nodeValue = nextValue;
    }
  });
};

export default function DashboardTranslator() {
  useEffect(() => {
    const translate = () => applyTranslations(localStorage.getItem("boster-bost-language") || "en");
    const observer = new MutationObserver(translate);
    translate();
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener("boster-language-change", translate);
    return () => {
      observer.disconnect();
      window.removeEventListener("boster-language-change", translate);
    };
  }, []);

  return null;
}
