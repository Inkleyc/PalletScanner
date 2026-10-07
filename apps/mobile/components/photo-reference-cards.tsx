import { useState } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { AppPalette } from "@/constants/app-palette";
import { WebPhotoCamera, type WebCapturedPhoto } from "@/components/web-photo-camera";

type PhotoReferenceCardsProps = {
  shots: string[];
  photoCount: number;
  onCapture: (shot: string, photo?: WebCapturedPhoto) => void;
  onUpload: (shot: string) => void;
};

const fallbackShots = [
  "Full item from the front",
  "Model and serial label",
  "Included accessories",
  "Ports, controls, and connections",
  "Any wear, damage, or missing pieces",
];

export function PhotoReferenceCards({ shots, photoCount, onCapture, onUpload }: PhotoReferenceCardsProps) {
  const checklist = (shots.length > 0 ? shots : fallbackShots).slice(0, 6);
  const [cameraShot, setCameraShot] = useState<string | null>(null);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Listing photo checklist</Text>
      <Text style={styles.subheading}>
        {photoCount} photo{photoCount === 1 ? "" : "s"} added. Capture the views a buyer needs to verify this item.
      </Text>
      <View style={styles.list}>
        {checklist.map((shot, index) => (
          <View key={`${shot}-${index}`} style={styles.row}>
            <View style={styles.number}><Text style={styles.numberText}>{index + 1}</Text></View>
            <Text style={styles.shot}>{shot}</Text>
            <View style={styles.actions}>
              <TouchableOpacity
                accessibilityHint={`Opens the camera for: ${shot}`}
                accessibilityLabel={`Take photo: ${shot}`}
                accessibilityRole="button"
                style={styles.action}
                onPress={() => Platform.OS === "web" ? setCameraShot(shot) : onCapture(shot)}
              >
                <Text style={styles.actionText}>Take photo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityHint={`Choose an existing photo for: ${shot}`}
                accessibilityLabel={`Upload photo: ${shot}`}
                accessibilityRole="button"
                style={styles.secondaryAction}
                onPress={() => onUpload(shot)}
              >
                <Text style={styles.secondaryActionText}>Upload</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>
      <WebPhotoCamera
        active={Boolean(cameraShot)}
        guidance={cameraShot ?? "Take a clear product photo."}
        onCancel={() => setCameraShot(null)}
        onCapture={(photo) => {
          const shot = cameraShot ?? "Product photo";
          setCameraShot(null);
          onCapture(shot, photo);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 12 },
  heading: { color: AppPalette.text, fontSize: 13, fontWeight: "700", marginBottom: 4 },
  subheading: { color: AppPalette.textMuted, fontSize: 12, lineHeight: 18, marginBottom: 10 },
  list: { borderColor: AppPalette.border, borderRadius: 8, borderWidth: 1, overflow: "hidden" },
  row: { alignItems: "center", backgroundColor: AppPalette.surface, borderBottomColor: AppPalette.border, borderBottomWidth: 1, flexDirection: "row", gap: 10, minHeight: 54, padding: 10 },
  number: { alignItems: "center", backgroundColor: AppPalette.surfaceMuted, borderRadius: 8, height: 28, justifyContent: "center", width: 28 },
  numberText: { color: AppPalette.textMuted, fontSize: 12, fontWeight: "700" },
  shot: { color: AppPalette.text, flex: 1, fontSize: 13, lineHeight: 18 },
  actions: { alignItems: "center", flexDirection: "row", gap: 6 },
  action: { backgroundColor: AppPalette.infoSoft, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  actionText: { color: AppPalette.info, fontSize: 12, fontWeight: "700" },
  secondaryAction: { borderColor: AppPalette.border, borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
  secondaryActionText: { color: AppPalette.text, fontSize: 12, fontWeight: "700" },
});
