import React from "react";
import {
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

export interface MarkdownStyles {
  container: StyleProp<ViewStyle>;
  body: StyleProp<TextStyle>;
  heading1: StyleProp<TextStyle>;
  heading2: StyleProp<TextStyle>;
  heading3: StyleProp<TextStyle>;
  strong: StyleProp<TextStyle>;
  emphasis: StyleProp<TextStyle>;
  inlineCode: StyleProp<TextStyle>;
  link: StyleProp<TextStyle>;
  blockquote: StyleProp<ViewStyle>;
  codeBlock: StyleProp<ViewStyle>;
  codeText: StyleProp<TextStyle>;
  spacer: StyleProp<ViewStyle>;
}

/** Renders the Markdown subset used by Linear issue descriptions and comments. */
export function MarkdownContent({
  markdown,
  onOpenLink,
  styles,
}: {
  markdown: string;
  onOpenLink: (url: string) => Promise<void>;
  styles: MarkdownStyles;
}) {
  const lines = markdown.split("\n");
  const blocks: React.ReactNode[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.startsWith("```")) {
      const code: string[] = [];
      while (index + 1 < lines.length && !lines[index + 1]?.startsWith("```")) {
        code.push(lines[index + 1] ?? "");
        index += 1;
      }
      if (lines[index + 1]?.startsWith("```")) index += 1;
      blocks.push(
        <View key={`code-${index}`} style={styles.codeBlock}>
          <Text style={styles.codeText}>{code.join("\n")}</Text>
        </View>,
      );
      continue;
    }
    if (line.startsWith("### ")) {
      blocks.push(
        <Text key={index} style={styles.heading3}>
          {renderInline(line.slice(4), styles, onOpenLink)}
        </Text>,
      );
      continue;
    }
    if (line.startsWith("## ")) {
      blocks.push(
        <Text key={index} style={styles.heading2}>
          {renderInline(line.slice(3), styles, onOpenLink)}
        </Text>,
      );
      continue;
    }
    if (line.startsWith("# ")) {
      blocks.push(
        <Text key={index} style={styles.heading1}>
          {renderInline(line.slice(2), styles, onOpenLink)}
        </Text>,
      );
      continue;
    }
    const task = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/);
    if (task) {
      blocks.push(
        <Text key={index} style={styles.body}>
          {task[1]?.toLowerCase() === "x" ? "☑" : "☐"}{" "}
          {renderInline(task[2] ?? "", styles, onOpenLink)}
        </Text>,
      );
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      blocks.push(
        <Text key={index} style={styles.body}>
          • {renderInline(bullet[1] ?? "", styles, onOpenLink)}
        </Text>,
      );
      continue;
    }
    const numbered = line.match(/^\s*(\d+)\.\s+(.*)$/);
    if (numbered) {
      blocks.push(
        <Text key={index} style={styles.body}>
          {numbered[1]}. {renderInline(numbered[2] ?? "", styles, onOpenLink)}
        </Text>,
      );
      continue;
    }
    if (line.startsWith("> ")) {
      blocks.push(
        <View key={index} style={styles.blockquote}>
          <Text style={styles.body}>
            {renderInline(line.slice(2), styles, onOpenLink)}
          </Text>
        </View>,
      );
      continue;
    }
    if (!line.trim()) {
      blocks.push(<View key={index} style={styles.spacer} />);
      continue;
    }
    blocks.push(
      <Text key={index} style={styles.body}>
        {renderInline(line, styles, onOpenLink)}
      </Text>,
    );
  }

  return <View style={styles.container}>{blocks}</View>;
}

function renderInline(
  value: string,
  styles: MarkdownStyles,
  onOpenLink: (url: string) => Promise<void>,
): React.ReactNode[] {
  const pattern =
    /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|\*[^*\n]+\*|_[^_\n]+_)/g;
  const nodes: React.ReactNode[] = [];
  let cursor = 0;

  for (const match of value.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > cursor) nodes.push(value.slice(cursor, start));
    const token = match[0];
    const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
    if (link) {
      const url = link[2] ?? "";
      nodes.push(
        <Text
          key={`${start}-link`}
          accessibilityRole="link"
          onPress={() => void onOpenLink(url)}
          style={styles.link}
        >
          {link[1]}
        </Text>,
      );
    } else if (token.startsWith("**") || token.startsWith("__")) {
      nodes.push(
        <Text key={`${start}-strong`} style={styles.strong}>
          {token.slice(2, -2)}
        </Text>,
      );
    } else if (token.startsWith("`")) {
      nodes.push(
        <Text key={`${start}-code`} style={styles.inlineCode}>
          {token.slice(1, -1)}
        </Text>,
      );
    } else {
      nodes.push(
        <Text key={`${start}-emphasis`} style={styles.emphasis}>
          {token.slice(1, -1)}
        </Text>,
      );
    }
    cursor = start + token.length;
  }
  if (cursor < value.length) nodes.push(value.slice(cursor));
  return nodes;
}
