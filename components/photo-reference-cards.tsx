import * as WebBrowser from "expo-web-browser";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { AppPalette } from "@/constants/app-palette";

type PhotoReferenceCardsProps = {
  queries: string[];
};

const buildImageSearchUrl = (query: string) =>
  `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`;

export function PhotoReferenceCards({
  queries,
}: PhotoReferenceCardsProps) {
  if (queries.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Reference Photos</Text>
      <Text style={styles.subheading}>
        Open a quick example search to see the kind of listing photos Claude is pointing you toward.
      </Text>
      <View style={styles.cardList}>
        {queries.map((query) => (
          <View key={query} style={styles.card}>
            <Text style={styles.cardTitle}>{query}</Text>
            <Text style={styles.cardBody}>
              Browse example listing photos in an in-app browser tab.
            </Text>
            <TouchableOpacity
              style={styles.cardAction}
              onPress={() => {
                void WebBrowser.openBrowserAsync(buildImageSearchUrl(query));
              }}
            >
              <Text style={styles.cardActionText}>View Examples</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
  },
  heading: {
    fontSize: 12,
    fontWeight: "700",
    color: AppPalette.text,
    marginBottom: 4,
  },
  subheading: {
    fontSize: 12,
    lineHeight: 18,
    color: AppPalette.textMuted,
    marginBottom: 10,
  },
  cardList: {
    gap: 10,
  },
  card: {
    backgroundColor: AppPalette.surface,
    borderWidth: 1,
    borderColor: AppPalette.border,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: AppPalette.text,
  },
  cardBody: {
    fontSize: 12,
    lineHeight: 18,
    color: AppPalette.textMuted,
  },
  cardAction: {
    alignSelf: "flex-start",
    backgroundColor: AppPalette.infoSoft,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  cardActionText: {
    fontSize: 12,
    fontWeight: "700",
    color: AppPalette.info,
  },
});
