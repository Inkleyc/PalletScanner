const fs = require("fs");

const code = `import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
  Share,
} from "react-native";

export default function InventoryScreen() {
  const items = global.inventory ?? [];
  const totalLow = items.reduce((sum: number, item: any) => sum + item.low_price, 0);
  const totalHigh = items.reduce((sum: number, item: any) => sum + item.high_price, 0);

  const removeItem = (id: number) => {
    Alert.alert("Remove Item", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          global.inventory = global.inventory.filter((item: any) => item.id !== id);
        },
      },
    ]);
  };

  const exportCSV = async () => {
    if (items.length === 0) {
      Alert.alert("No items", "Scan and save some items first.");
      return;
    }
    const header = "Name,Condition,Low Price,High Price,Platform,Listing Title,Listing Description";
    const rows = items.map((item: any) =>
      [\`"\${item.name}"\`,
       \`"\${item.condition}"\`,
       item.low_price,
       item.high_price,
       \`"\${item.best_platform}"\`,
       \`"\${item.listing_title}"\`,
       \`"\${item.listing_description.replace(/"/g, "'")}"\`
      ].join(",")
    );
    const csv = [header, ...rows].join("\\n");
    try {
      await Share.share({
        message: csv,
        title: "PalletScanner Inventory",
      });
    } catch (e) {
      Alert.alert("Error", "Could not export inventory.");
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Inventory</Text>
      <Text style={styles.subtitle}>Items scanned this session</Text>

      <View style={styles.totalCard}>
        <View style={styles.totalRow}>
          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>Items</Text>
            <Text style={styles.totalValue}>{items.length}</Text>
          </View>
          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>Est. Low</Text>
            <Text style={styles.totalValue}>\${totalLow}</Text>
          </View>
          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>Est. High</Text>
            <Text style={styles.totalValue}>\${totalHigh}</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.exportBtn} onPress={exportCSV}>
          <Text style={styles.exportBtnText}>Export to CSV</Text>
        </TouchableOpacity>
      </View>

      {items.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📦</Text>
          <Text style={styles.emptyText}>No items yet</Text>
          <Text style={styles.emptySubtext}>
            Scan items on the Home tab and tap Save to Inventory
          </Text>
        </View>
      )}

      {items.map((item: any) => (
        <View key={item.id} style={styles.itemCard}>
          <View style={styles.itemTop}>
            {item.photo && (
              <Image source={{ uri: item.photo }} style={styles.itemPhoto} />
            )}
            <View style={styles.itemInfo}>
              <Text style={styles.itemName}>{item.name}</Text>
              <View style={styles.badgeRow}>
                <Text style={styles.priceBadge}>
                  \${item.low_price}-\${item.high_price}
                </Text>
                <Text style={styles.conditionBadge}>{item.condition}</Text>
              </View>
              <Text style={styles.platformText}>{item.best_platform}</Text>
            </View>
          </View>
          <View style={styles.itemActions}>
            <TouchableOpacity
              style={styles.removeBtn}
              onPress={() => removeItem(item.id)}
            >
              <Text style={styles.removeBtnText}>Remove</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 24, paddingTop: 60 },
  title: { fontSize: 28, fontWeight: "600", color: "#111", marginBottom: 4 },
  subtitle: { fontSize: 14, color: "#666", marginBottom: 24 },
  totalCard: { backgroundColor: "#f9f9f9", borderRadius: 12, padding: 16, marginBottom: 24 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  totalBox: { alignItems: "center", flex: 1 },
  totalLabel: { fontSize: 12, color: "#666", marginBottom: 4 },
  totalValue: { fontSize: 22, fontWeight: "600", color: "#111" },
  exportBtn: { backgroundColor: "#111", padding: 12, borderRadius: 8, alignItems: "center" },
  exportBtnText: { color: "#fff", fontWeight: "500", fontSize: 14 },
  emptyState: { alignItems: "center", paddingTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 18, fontWeight: "600", color: "#111", marginBottom: 8 },
  emptySubtext: { fontSize: 14, color: "#666", textAlign: "center", lineHeight: 20 },
  itemCard: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 0.5, borderColor: "#ddd", marginBottom: 12, overflow: "hidden" },
  itemTop: { flexDirection: "row", padding: 12, gap: 12 },
  itemPhoto: { width: 70, height: 70, borderRadius: 8, backgroundColor: "#f0f0f0" },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 15, fontWeight: "600", color: "#111", marginBottom: 6 },
  badgeRow: { flexDirection: "row", gap: 6, marginBottom: 4 },
  priceBadge: { backgroundColor: "#e6f4ea", color: "#2d6a4f", fontSize: 12, fontWeight: "500", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  conditionBadge: { backgroundColor: "#fff8e1", color: "#856404", fontSize: 12, fontWeight: "500", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  platformText: { fontSize: 12, color: "#666" },
  itemActions: { borderTopWidth: 0.5, borderTopColor: "#eee", padding: 10, alignItems: "flex-end" },
  removeBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 0.5, borderColor: "#ddd" },
  removeBtnText: { fontSize: 13, color: "#999" },
});
`;

fs.writeFileSync("app/(tabs)/explore.tsx", code, "utf8");
console.log("Inventory screen updated successfully!");
