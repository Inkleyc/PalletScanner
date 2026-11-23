import {
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type { Dispatch, SetStateAction } from "react";

import type { InventoryItem } from "@palletscanner/core";
import type { ItemDetailDraft } from "./inventory-helpers";
import type { InventoryStyles } from "./inventory-styles";

type ItemDetailModalProps = {
  styles: InventoryStyles;
  selectedItem: InventoryItem | null;
  itemDetailDraft: ItemDetailDraft;
  updateItemDetailDraft: (field: keyof ItemDetailDraft, value: string) => void;
  setItemDetailDraft: Dispatch<SetStateAction<ItemDetailDraft>>;
  setSelectedItemId: Dispatch<SetStateAction<number | null>>;
  getPalletName: (palletId: string) => string;
  postItemFromDetails: (platform: "facebook" | "ebay") => Promise<void>;
  markSoldFromDetails: (item: InventoryItem) => void;
  removeItemFromDetails: (item: InventoryItem) => void;
  saveItemDetails: (closeAfterSave?: boolean) => Promise<InventoryItem | null>;
};

export const ItemDetailModal = ({
  styles,
  selectedItem,
  itemDetailDraft,
  updateItemDetailDraft,
  setItemDetailDraft,
  setSelectedItemId,
  getPalletName,
  postItemFromDetails,
  markSoldFromDetails,
  removeItemFromDetails,
  saveItemDetails,
}: ItemDetailModalProps) => {
  return (
  <Modal
    visible={Boolean(selectedItem)}
    transparent
    animationType="fade"
    onRequestClose={() => setSelectedItemId(null)}
  >
    <Pressable style={styles.itemDetailBackdrop} onPress={() => setSelectedItemId(null)}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Pressable style={styles.itemDetailCard} onPress={Keyboard.dismiss}>
        <View style={styles.itemDetailHeader}>
          <View style={styles.itemDetailHeading}>
            <Text style={styles.itemDetailTitle}>{selectedItem?.name ?? "Item details"}</Text>
            <Text style={styles.itemDetailSubtitle}>{selectedItem ? getPalletName(selectedItem.palletId) : ""}</Text>
          </View>
          <TouchableOpacity style={styles.itemDetailClose} onPress={() => setSelectedItemId(null)}>
            <Text style={styles.itemDetailCloseText}>Close</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.itemDetailContent} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled">
          {selectedItem?.photos?.length || selectedItem?.photo ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.itemDetailPhotos}>
              {(selectedItem.photos?.length ? selectedItem.photos : selectedItem.photo ? [selectedItem.photo] : []).map((uri, index) => (
                <Image key={`${uri}-${index}`} source={{ uri }} style={styles.itemDetailPhoto} />
              ))}
            </ScrollView>
          ) : null}
          <View style={styles.itemEditGrid}>
            <View style={styles.itemEditWide}><Text style={styles.itemDetailLabel}>Item name</Text><TextInput style={styles.itemEditInput} value={itemDetailDraft.name} onChangeText={(value) => updateItemDetailDraft("name", value)} /></View>
            <View style={styles.itemEditField}><Text style={styles.itemDetailLabel}>Category</Text><TextInput style={styles.itemEditInput} value={itemDetailDraft.category} onChangeText={(value) => updateItemDetailDraft("category", value)} /></View>
            <View style={styles.itemEditField}><Text style={styles.itemDetailLabel}>Condition</Text><TextInput style={styles.itemEditInput} value={itemDetailDraft.condition} onChangeText={(value) => updateItemDetailDraft("condition", value)} /></View>
            <View style={styles.itemEditField}><Text style={styles.itemDetailLabel}>Quantity</Text><TextInput style={[styles.itemEditInput, styles.itemEditNumInput]} value={itemDetailDraft.quantity} onChangeText={(value) => updateItemDetailDraft("quantity", value)} keyboardType="number-pad" /></View>
            <View style={styles.itemEditField}><Text style={styles.itemDetailLabel}>Low estimate</Text><TextInput style={[styles.itemEditInput, styles.itemEditNumInput]} value={itemDetailDraft.low} onChangeText={(value) => updateItemDetailDraft("low", value)} keyboardType="decimal-pad" /></View>
            <View style={styles.itemEditField}><Text style={styles.itemDetailLabel}>High estimate</Text><TextInput style={[styles.itemEditInput, styles.itemEditNumInput]} value={itemDetailDraft.high} onChangeText={(value) => updateItemDetailDraft("high", value)} keyboardType="decimal-pad" /></View>
            <View style={styles.itemEditField}><Text style={styles.itemDetailLabel}>Floor price</Text><TextInput style={[styles.itemEditInput, styles.itemEditNumInput]} value={itemDetailDraft.floor} onChangeText={(value) => updateItemDetailDraft("floor", value)} keyboardType="decimal-pad" /></View>
          </View>
          <View style={styles.listingPriceEditor}><Text style={styles.itemDetailLabel}>Approved listing price</Text><Text style={styles.listingPriceHelp}>This exact price is used for eBay after you approve posting. Saving alone does not update an active listing.</Text><View style={styles.listingPriceRow}><Text style={styles.listingPriceCurrency}>$</Text><TextInput style={styles.listingPriceInput} value={itemDetailDraft.listingPrice} onChangeText={(value) => updateItemDetailDraft("listingPrice", value)} keyboardType="decimal-pad" placeholder="0.00" /></View></View>
          <View style={styles.itemDetailSection}><Text style={styles.itemDetailLabel}>eBay title</Text><TextInput style={styles.itemEditInput} value={itemDetailDraft.ebayTitle} onChangeText={(value) => updateItemDetailDraft("ebayTitle", value)} maxLength={80} /><Text style={styles.characterCount}>{itemDetailDraft.ebayTitle.length}/80</Text></View>
          <View style={styles.itemDetailSection}><Text style={styles.itemDetailLabel}>eBay description</Text><TextInput style={[styles.itemEditInput, styles.itemEditTextArea]} value={itemDetailDraft.ebayDescription} onChangeText={(value) => updateItemDetailDraft("ebayDescription", value)} multiline textAlignVertical="top" /></View>
          {Object.keys(itemDetailDraft.ebayItemSpecifics).length > 0 ? (
            <View style={styles.itemDetailSection}><Text style={styles.itemDetailSectionTitle}>eBay details</Text>{Object.entries(itemDetailDraft.ebayItemSpecifics).map(([key, value]) => <View key={key} style={styles.itemSpecificField}><Text style={styles.itemDetailLabel}>{key}</Text><TextInput style={styles.itemEditInput} value={value} onChangeText={(nextValue) => setItemDetailDraft((current) => ({ ...current, ebayItemSpecifics: { ...current.ebayItemSpecifics, [key]: nextValue } }))} /></View>)}</View>
          ) : null}
          {selectedItem ? (
            <View style={styles.itemDetailActions}>
              <TouchableOpacity style={styles.itemDetailPlatformButton} onPress={() => { void postItemFromDetails("facebook"); }}><Text style={styles.itemDetailPlatformText}>Post to Facebook</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.itemDetailPlatformButton, styles.itemDetailEbayButton]} onPress={() => { void postItemFromDetails("ebay"); }}><Text style={styles.itemDetailPlatformText}>Post to eBay</Text></TouchableOpacity>
              <TouchableOpacity style={styles.itemDetailMoreButton} onPress={() => markSoldFromDetails(selectedItem)}><Text style={styles.itemDetailMoreText}>{selectedItem.soldPrice !== null ? "Edit sold price" : "Mark sold"}</Text></TouchableOpacity>
              <TouchableOpacity style={styles.itemDetailRemoveButton} onPress={() => removeItemFromDetails(selectedItem)}><Text style={styles.itemDetailRemoveText}>Remove item</Text></TouchableOpacity>
            </View>
          ) : null}
          <TouchableOpacity style={styles.saveItemChangesButton} onPress={() => { void saveItemDetails(); }}><Text style={styles.saveListingPriceText}>Save changes</Text></TouchableOpacity>
        </ScrollView>
        </Pressable>
      </KeyboardAvoidingView>
    </Pressable>
  </Modal>
  );
};
