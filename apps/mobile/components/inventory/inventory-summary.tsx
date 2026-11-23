import { Text, TouchableOpacity, View } from "react-native";
import type { Dispatch, SetStateAction } from "react";
import { useRouter } from "expo-router";

import type {
  InventoryItem,
  ListingFilter,
} from "@palletscanner/core";
import type { InventoryStyles } from "./inventory-styles";

type InventorySummaryCardProps = {
  styles: InventoryStyles;
  isLargeLayout: boolean;
  summaryExpanded: boolean;
  setSummaryExpanded: Dispatch<SetStateAction<boolean>>;
  filteredItems: InventoryItem[];
  totalLow: number;
  totalHigh: number;
  totalPalletCost: number;
  projectedProfitLow: number;
  projectedProfitHigh: number;
  missingFacebookItems: InventoryItem[];
  facebookDraftItems: InventoryItem[];
  facebookMissingUrlItems: InventoryItem[];
  noPhotoItems: InventoryItem[];
  missingEbayItems: InventoryItem[];
  setListingFilter: Dispatch<SetStateAction<ListingFilter>>;
  exportCSV: () => Promise<void>;
  emailInventory: () => Promise<void>;
  router: ReturnType<typeof useRouter>;
  bulkFacebookQueue: number[];
  bulkEbayQueue: number[];
  startBulkFacebookPosting: () => void;
  continueBulkFacebookPosting: () => void;
  cancelBulkFacebookPosting: () => void;
  startBulkEbayPosting: () => void;
  continueBulkEbayPosting: () => void;
  cancelBulkEbayPosting: () => void;
  bundleCandidateItems: InventoryItem[];
  bundleLoading: boolean;
  suggestBundle: () => Promise<void>;
};

export const InventorySummaryCard = ({
  styles,
  isLargeLayout,
  summaryExpanded,
  setSummaryExpanded,
  filteredItems,
  totalLow,
  totalHigh,
  totalPalletCost,
  projectedProfitLow,
  projectedProfitHigh,
  missingFacebookItems,
  facebookDraftItems,
  facebookMissingUrlItems,
  noPhotoItems,
  missingEbayItems,
  setListingFilter,
  exportCSV,
  emailInventory,
  router,
  bulkFacebookQueue,
  bulkEbayQueue,
  startBulkFacebookPosting,
  continueBulkFacebookPosting,
  cancelBulkFacebookPosting,
  startBulkEbayPosting,
  continueBulkEbayPosting,
  cancelBulkEbayPosting,
  bundleCandidateItems,
  bundleLoading,
  suggestBundle,
}: InventorySummaryCardProps) => {
  return (
  <View style={styles.totalCard}>
    <TouchableOpacity
      style={styles.sectionHeader}
      onPress={() => setSummaryExpanded((current) => !current)}
    >
      <View>
        <Text style={styles.filterLabel}>SUMMARY</Text>
        <Text style={styles.sectionSummaryText}>
          {filteredItems.length} items | Low ${totalLow} | High ${totalHigh}
        </Text>
      </View>
      <Text style={styles.sectionToggleText}>
        {summaryExpanded ? "Hide" : "Show"}
      </Text>
    </TouchableOpacity>

    {summaryExpanded ? (
      <>
        <View style={styles.totalRow}>
          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>Items</Text>
            <Text style={styles.totalValue}>{filteredItems.length}</Text>
          </View>
          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>Low</Text>
            <Text style={styles.totalValue}>${totalLow}</Text>
          </View>
          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>High</Text>
            <Text style={styles.totalValue}>${totalHigh}</Text>
          </View>
        </View>
        {isLargeLayout ? (
          <View style={styles.profitRow}>
            <View style={styles.profitBox}>
              <Text style={styles.totalLabel}>Pallet Cost</Text>
              <Text style={styles.profitValue}>${totalPalletCost}</Text>
            </View>
            <View style={styles.profitBox}>
              <Text style={styles.totalLabel}>Profit Low</Text>
              <Text style={styles.profitValue}>${projectedProfitLow}</Text>
            </View>
            <View style={styles.profitBox}>
              <Text style={styles.totalLabel}>Profit High</Text>
              <Text style={styles.profitValue}>${projectedProfitHigh}</Text>
            </View>
          </View>
        ) : null}
        <View style={styles.facebookReadinessGrid}>
          <TouchableOpacity
            style={styles.facebookReadinessBox}
            onPress={() => setListingFilter("needs-facebook")}
          >
            <Text style={styles.totalLabel}>Needs Facebook</Text>
            <Text style={styles.facebookReadinessValue}>
              {missingFacebookItems.length}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.facebookReadinessBox}
            onPress={() => setListingFilter("facebook-drafts")}
          >
            <Text style={styles.totalLabel}>Drafts Open</Text>
            <Text style={styles.facebookReadinessValue}>
              {facebookDraftItems.length}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.facebookReadinessBox}
            onPress={() => setListingFilter("missing-facebook-url")}
          >
            <Text style={styles.totalLabel}>Missing URLs</Text>
            <Text style={styles.facebookReadinessValue}>
              {facebookMissingUrlItems.length}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.facebookReadinessBox}
            onPress={() => setListingFilter("no-photos")}
          >
            <Text style={styles.totalLabel}>No Photos</Text>
            <Text style={styles.facebookReadinessValue}>
              {noPhotoItems.length}
            </Text>
          </TouchableOpacity>
        </View>
        {isLargeLayout ? (
          <>
            <View style={styles.exportRow}>
              <TouchableOpacity style={styles.exportBtn} onPress={exportCSV}>
                <Text style={styles.exportBtnText}>Export CSV</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.emailBtn} onPress={emailInventory}>
                <Text style={styles.emailBtnText}>Email Inventory</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.bulkFacebookBtn}
              onPress={() => router.push("/facebook" as never)}
            >
              <Text style={styles.bulkFacebookBtnText}>
                Open Facebook Queue ({missingFacebookItems.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.bulkFacebookSecondaryBtn}
              onPress={
                bulkFacebookQueue.length > 0
                  ? continueBulkFacebookPosting
                  : startBulkFacebookPosting
              }
            >
              <Text style={styles.bulkFacebookSecondaryBtnText}>
                {bulkFacebookQueue.length > 0
                  ? `Continue Quick Posting (${bulkFacebookQueue.length} left)`
                  : "Quick Open Next Facebook Draft"}
              </Text>
            </TouchableOpacity>
            {bulkFacebookQueue.length > 0 && (
              <TouchableOpacity
                style={styles.cancelBulkBtn}
                onPress={cancelBulkFacebookPosting}
              >
                <Text style={styles.cancelBulkBtnText}>
                  Stop Facebook Posting
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.bulkEbayBtn}
              onPress={
                bulkEbayQueue.length > 0
                  ? continueBulkEbayPosting
                  : startBulkEbayPosting
              }
            >
              <Text style={styles.bulkEbayBtnText}>
                {bulkEbayQueue.length > 0
                  ? `Continue Mass eBay Posting (${bulkEbayQueue.length} left)`
                  : `Post All Missing to eBay (${missingEbayItems.length})`}
              </Text>
            </TouchableOpacity>
            {bulkEbayQueue.length > 0 && (
              <TouchableOpacity
                style={styles.cancelBulkBtn}
                onPress={cancelBulkEbayPosting}
              >
                <Text style={styles.cancelBulkBtnText}>Stop Mass Posting</Text>
              </TouchableOpacity>
            )}
            {bundleCandidateItems.length >= 3 && (
              <TouchableOpacity
                style={styles.bundleBtn}
                onPress={() => {
                  void suggestBundle();
                }}
              >
                <Text style={styles.bundleBtnText}>
                  {bundleLoading ? "Suggesting Bundles..." : "Suggest Bundle"}
                </Text>
              </TouchableOpacity>
            )}
          </>
        ) : null}
      </>
    ) : null}
  </View>
  );
};
