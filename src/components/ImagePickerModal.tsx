import React, { useEffect } from 'react';
import { Alert, Platform, Linking, PermissionsAndroid } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

interface ImagePickerModalProps {
  visible: boolean;
  onClose: () => void;
  onImagePicked: (uri: string) => void;
  title?: string;
  subtitle?: string;
  allowFrontCamera?: boolean;
}

/**
 * Camera-only capture "modal" — no gallery option, by design (live photos
 * only, for identity/job-proof/fraud-prevention purposes).
 *
 * Renders no UI of its own: the camera opens immediately, every time this
 * becomes visible, with no intermediate "Open Camera" sheet to tap through
 * first. `title`/`subtitle` are accepted for backwards compatibility with
 * existing call sites but are no longer shown anywhere.
 */
export default function ImagePickerModal({
  visible,
  onClose,
  onImagePicked,
  allowFrontCamera = false,
}: ImagePickerModalProps) {
  // Guards against double-firing if `visible` toggles true twice in a row
  // before the camera activity has actually returned control to us.
  const launchingRef = React.useRef(false);

  useEffect(() => {
    if (!visible || launchingRef.current) return;
    launchingRef.current = true;

    (async () => {
      try {
        let granted = false;
        if (Platform.OS === 'android') {
          const androidStatus = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.CAMERA,
          );
          granted = androidStatus === PermissionsAndroid.RESULTS.GRANTED;
        }

        if (!granted) {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          granted = status === 'granted';
        }

        if (!granted) {
          Alert.alert(
            'Camera Access Required',
            'Camera permission is required to take photos for identity verification. Please enable camera access in Settings.',
            [
              { text: 'Cancel', style: 'cancel', onPress: onClose },
              { text: 'Open Settings', onPress: () => { Linking.openSettings(); onClose(); } },
            ],
          );
          return;
        }

        const result = await ImagePicker.launchCameraAsync({
          quality: 0.8,
          allowsEditing: Platform.OS === 'ios',
          cameraType: allowFrontCamera ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
        });

        if (!result.canceled && result.assets?.[0]?.uri) {
          const uri = result.assets[0].uri;
          // Close first so `visible` flips back to false — that's what
          // resets launchingRef below, letting the next "Add photo" tap
          // (which sets visible=true again) actually reopen the camera
          // instead of silently no-op'ing because visible never changed.
          onClose();
          onImagePicked(uri);
        } else {
          onClose();
        }
      } catch (e: any) {
        console.log('Camera error:', e);
        Alert.alert('Camera Error', e?.message || 'Failed to open camera.');
        onClose();
      }
    })();
  }, [visible]);

  // Reset the guard once the caller has actually closed this out, so the
  // next "Add photo" tap reliably reopens the camera.
  useEffect(() => {
    if (!visible) launchingRef.current = false;
  }, [visible]);

  return null;
}
