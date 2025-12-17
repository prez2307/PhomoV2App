import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCameraFormat,
  PhotoFile,
} from 'react-native-vision-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withSequence
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';

// ============================================================================
// SUBCOMPONENTS
// ============================================================================

function CameraFlashOverlay({ visible }: { visible: boolean }) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      opacity.value = 1;
      opacity.value = withTiming(0, { duration: 200 });
    }
  }, [visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { backgroundColor: 'white', zIndex: 1000 }, animatedStyle]}
      pointerEvents="none"
    />
  );
}

function FocusIndicator({
  position,
  visible,
}: {
  position: { x: number; y: number } | null;
  visible: boolean;
}) {
  const scale = useSharedValue(1.5);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible && position) {
      scale.value = 1.5;
      opacity.value = 1;
      scale.value = withTiming(1, { duration: 200 });
      opacity.value = withTiming(0, { duration: 1500 });
    }
  }, [visible, position]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  if (!position) return null;

  return (
    <Animated.View
      style={[
        styles.focusIndicator,
        { left: position.x - 40, top: position.y - 40 },
        animatedStyle,
      ]}
      pointerEvents="none"
    >
      <View style={styles.focusBox} />
    </Animated.View>
  );
}

function ZoomIndicator({ zoom, visible }: { zoom: number; visible: boolean }) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(visible ? 1 : 0, { duration: 200 });
  }, [visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.zoomIndicator, animatedStyle]} pointerEvents="none">
      <View style={styles.zoomBadge}>
        <Text style={styles.zoomText}>{zoom.toFixed(1)}x</Text>
      </View>
    </Animated.View>
  );
}

function ExposureSlider({
  exposure,
  onExposureChange,
  visible,
}: {
  exposure: number;
  onExposureChange: (val: number) => void;
  visible: boolean;
}) {
  const opacity = useSharedValue(0);
  const SLIDER_HEIGHT = 180;
  const THUMB_SIZE = 28;
  const MIN_EXPOSURE = -2;
  const MAX_EXPOSURE = 2;

  useEffect(() => {
    opacity.value = withTiming(visible ? 1 : 0, { duration: 200 });
  }, [visible]);

  const normalizedPosition = (exposure - MIN_EXPOSURE) / (MAX_EXPOSURE - MIN_EXPOSURE);
  const PADDING = 8;
  const thumbTop = PADDING + (1 - normalizedPosition) * (SLIDER_HEIGHT - THUMB_SIZE - PADDING * 2);

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      'worklet';
      const PADDING = 8;
      const trackHeight = SLIDER_HEIGHT - THUMB_SIZE - PADDING * 2;
      const normalized = 1 - Math.max(0, Math.min(1, (e.y - PADDING) / trackHeight));
      const newExposure = MIN_EXPOSURE + normalized * (MAX_EXPOSURE - MIN_EXPOSURE);
      scheduleOnRN(onExposureChange, newExposure);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  if (!visible) return null;

  return (
    <Animated.View style={[styles.exposureContainer, animatedStyle]}>
      <GestureDetector gesture={panGesture}>
        <View style={[styles.exposureTrack, { height: SLIDER_HEIGHT }]}>
          {/* Track background */}
          <View style={styles.exposureTrackBg} />
          {/* Zero mark */}
          <View style={styles.exposureZeroMark} />
          {/* Thumb with sun icon */}
          <View style={[styles.exposureThumb, { top: thumbTop }]}>
            <Ionicons name="sunny" size={18} color="#000" />
          </View>
        </View>
      </GestureDetector>
    </Animated.View>
  );
}

function GridOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[styles.gridLine, styles.gridVertical1]} />
      <View style={[styles.gridLine, styles.gridVertical2]} />
      <View style={[styles.gridLine, styles.gridHorizontal1]} />
      <View style={[styles.gridLine, styles.gridHorizontal2]} />
    </View>
  );
}

function CaptureButton({
  onCapture,
  disabled,
}: {
  onCapture: () => void;
  disabled: boolean;
}) {
  const scale = useSharedValue(1);
  const innerScale = useSharedValue(1);

  const handlePressIn = () => {
    scale.value = withSpring(0.95);
    innerScale.value = withSpring(0.85);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
    innerScale.value = withSpring(1);
  };

  const outerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const innerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: innerScale.value }],
  }));

  return (
    <Pressable
      onPress={onCapture}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
    >
      <Animated.View style={[styles.captureButton, outerStyle]}>
        <Animated.View style={[styles.captureButtonInner, innerStyle]} />
      </Animated.View>
    </Pressable>
  );
}

function ControlButton({
  icon,
  onPress,
  active,
  size = 28,
}: {
  icon: string;
  onPress: () => void;
  active?: boolean;
  size?: number;
}) {
  return (
    <TouchableOpacity style={styles.controlButton} onPress={onPress} activeOpacity={0.7}>
      <Ionicons
        name={icon as any}
        size={size}
        color={active ? '#007AFF' : '#FFFFFF'}
      />
    </TouchableOpacity>
  );
}

function TimerCountdown({
  seconds,
  onComplete,
}: {
  seconds: number;
  onComplete: () => void;
}) {
  const [count, setCount] = useState(seconds);
  const scale = useSharedValue(1);

  useEffect(() => {
    if (count > 0) {
      scale.value = withSequence(
        withTiming(1.3, { duration: 150 }),
        withTiming(1, { duration: 150 })
      );
      const timer = setTimeout(() => setCount(count - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      onComplete();
    }
  }, [count]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  if (count <= 0) return null;

  return (
    <View style={styles.timerOverlay}>
      <Animated.Text style={[styles.timerText, animatedStyle]}>{count}</Animated.Text>
    </View>
  );
}

function PhotoPreview({
  photo,
  onPress,
}: {
  photo: PhotoFile | null;
  onPress: () => void;
}) {
  const opacity = useSharedValue(0);
  const translateX = useSharedValue(-100);

  useEffect(() => {
    if (photo) {
      opacity.value = withTiming(1, { duration: 300 });
      translateX.value = withSpring(0);
    }
  }, [photo]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  if (!photo) return null;

  return (
    <Animated.View style={[styles.photoPreview, animatedStyle]}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
        <Image
          source={{ uri: `file://${photo.path}` }}
          style={styles.photoPreviewImage}
          contentFit="cover"
        />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ============================================================================
// MAIN CAMERA SCREEN
// ============================================================================

export default function CameraScreen() {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<Camera>(null);

  // Permissions
  const { hasPermission, requestPermission } = useCameraPermission();

  // Camera state
  const [cameraPosition, setCameraPosition] = useState<'front' | 'back'>('back');
  const [flash, setFlash] = useState<'off' | 'on'>('off');
  const [showGrid, setShowGrid] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [cameraReady, setCameraReady] = useState(false);

  // Capture state
  const [isCapturing, setIsCapturing] = useState(false);
  const [showFlashOverlay, setShowFlashOverlay] = useState(false);
  const [lastPhoto, setLastPhoto] = useState<PhotoFile | null>(null);

  // Focus state
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const [showFocusIndicator, setShowFocusIndicator] = useState(false);

  // Zoom state
  const [zoom, setZoom] = useState(1);
  const [showZoomIndicator, setShowZoomIndicator] = useState(false);
  const zoomValue = useSharedValue(1);
  const pinchStartZoom = useSharedValue(1);
  const zoomTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync zoom state with shared value
  useEffect(() => {
    zoomValue.value = zoom;
  }, [zoom]);

  // Exposure state
  const [exposure, setExposure] = useState(0);
  const [showExposureSlider, setShowExposureSlider] = useState(false);
  const exposureTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Timer state
  const [timerMode, setTimerMode] = useState<0 | 3 | 5 | 10>(0);
  const [timerActive, setTimerActive] = useState(false);

  // Camera device
  const device = useCameraDevice(cameraPosition);
  const maxZoom = device?.maxZoom ?? 10;

  // Camera format - optimized for quality
  const format = useCameraFormat(device, [
    { photoResolution: { width: 4032, height: 3024 } },
    { videoResolution: { width: 1920, height: 1080 } },
  ]);

  // Handle screen focus
  useFocusEffect(
    useCallback(() => {
      setIsActive(true);
      return () => setIsActive(false);
    }, [])
  );

  // Request permission on mount
  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission, requestPermission]);

  // Callbacks (defined before gestures that use them)
  const hideZoomIndicator = useCallback(() => {
    if (zoomTimeout.current) clearTimeout(zoomTimeout.current);
    zoomTimeout.current = setTimeout(() => setShowZoomIndicator(false), 1500);
  }, []);

  const handleFocus = useCallback(
    async (x: number, y: number) => {
      if (!cameraRef.current || !device?.supportsFocus) return;

      setFocusPoint({ x, y });
      setShowFocusIndicator(true);

      try {
        await cameraRef.current.focus({ x, y });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch (e) {
        console.log('Focus failed:', e);
      }

      setTimeout(() => setShowFocusIndicator(false), 1500);
    },
    [device]
  );

  const toggleExposureSlider = useCallback(() => {
    setShowExposureSlider((prev) => !prev);
    if (exposureTimeout.current) clearTimeout(exposureTimeout.current);
    exposureTimeout.current = setTimeout(() => setShowExposureSlider(false), 5000);
  }, []);

  const handleExposureChange = useCallback((val: number) => {
    setExposure(val);
    if (exposureTimeout.current) clearTimeout(exposureTimeout.current);
    exposureTimeout.current = setTimeout(() => setShowExposureSlider(false), 3000);
  }, []);

  const toggleCamera = useCallback(() => {
    setCameraPosition((prev) => (prev === 'back' ? 'front' : 'back'));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  // Pinch to zoom gesture
  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => {
          'worklet';
          pinchStartZoom.value = zoomValue.value;
        })
        .onUpdate((e) => {
          'worklet';
          const newZoom = Math.max(1, Math.min(maxZoom, pinchStartZoom.value * e.scale));
          zoomValue.value = newZoom;
          scheduleOnRN(setZoom, newZoom);
          scheduleOnRN(setShowZoomIndicator, true);
        })
        .onEnd(() => {
          'worklet';
          scheduleOnRN(hideZoomIndicator);
        }),
    [maxZoom, zoomValue, pinchStartZoom, hideZoomIndicator]
  );

  // Double tap to flip camera (requires pinch to fail so pinch doesn't trigger it)
  const doubleTapGesture = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .maxDuration(300)
        .requireExternalGestureToFail(pinchGesture)
        .onEnd(() => {
          'worklet';
          scheduleOnRN(toggleCamera);
        }),
    [toggleCamera, pinchGesture]
  );

  // Tap to focus gesture (waits for double tap to fail)
  const tapGesture = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(250)
        .onEnd((e) => {
          'worklet';
          scheduleOnRN(handleFocus, e.x, e.y);
        })
        .requireExternalGestureToFail(doubleTapGesture),
    [handleFocus, doubleTapGesture]
  );

  const composedGesture = Gesture.Simultaneous(pinchGesture, Gesture.Exclusive(doubleTapGesture, tapGesture));

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || isCapturing || !cameraReady) return;

    // If timer is set, start countdown
    if (timerMode > 0 && !timerActive) {
      setTimerActive(true);
      return;
    }

    setIsCapturing(true);
    setShowFlashOverlay(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const photo = await cameraRef.current.takePhoto({
        flash: flash,
        enableShutterSound: false,
      });

      setLastPhoto(photo);
      console.log('Photo captured:', photo.path);
    } catch (e) {
      console.error('Capture failed:', e);
    } finally {
      setIsCapturing(false);
      setTimeout(() => setShowFlashOverlay(false), 200);
    }
  }, [isCapturing, cameraReady, flash, timerMode, timerActive]);

  const handleTimerComplete = useCallback(() => {
    setTimerActive(false);
    handleCapture();
  }, [handleCapture]);

  const toggleFlash = useCallback(() => {
    setFlash((prev) => (prev === 'off' ? 'on' : 'off'));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const toggleGrid = useCallback(() => {
    setShowGrid((prev) => !prev);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const cycleTimer = useCallback(() => {
    setTimerMode((prev) => {
      const modes: (0 | 3 | 5 | 10)[] = [0, 3, 5, 10];
      const idx = modes.indexOf(prev);
      return modes[(idx + 1) % modes.length];
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  // Permission denied UI
  if (!hasPermission) {
    return (
      <View style={styles.permissionContainer}>
        <Ionicons name="camera-outline" size={64} color="#666" />
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionText}>
          PhomoCam needs camera access to take photos
        </Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Grant Access</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => Linking.openSettings()}
        >
          <Text style={styles.settingsButtonText}>Open Settings</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // No device found
  if (!device) {
    return (
      <View style={styles.permissionContainer}>
        <ActivityIndicator size="large" color="#FFF" />
        <Text style={styles.permissionText}>Loading camera...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Camera */}
      <GestureDetector gesture={composedGesture}>
        <View style={StyleSheet.absoluteFill}>
          <Camera
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            device={device}
            format={format}
            isActive={isActive && !timerActive}
            photo={true}
            zoom={zoom}
            exposure={exposure}
            onInitialized={() => setCameraReady(true)}
            onError={(e) => console.error('Camera error:', e)}
          />
        </View>
      </GestureDetector>

      {/* Overlays */}
      <CameraFlashOverlay visible={showFlashOverlay} />
      <GridOverlay visible={showGrid} />
      <FocusIndicator position={focusPoint} visible={showFocusIndicator} />
      <ZoomIndicator zoom={zoom} visible={showZoomIndicator} />
      <ExposureSlider
        exposure={exposure}
        onExposureChange={handleExposureChange}
        visible={showExposureSlider}
      />

      {/* Timer Countdown */}
      {timerActive && (
        <TimerCountdown seconds={timerMode} onComplete={handleTimerComplete} />
      )}

      {/* Top Controls */}
      <View style={[styles.topControls, { top: insets.top + 10 }]}>
        <ControlButton
          icon={flash === 'on' ? 'flash' : 'flash-off'}
          onPress={toggleFlash}
          active={flash === 'on'}
        />
        <ControlButton
          icon="grid"
          onPress={toggleGrid}
          active={showGrid}
        />
        <ControlButton
          icon="sunny-outline"
          onPress={toggleExposureSlider}
          active={showExposureSlider}
        />
        <ControlButton
          icon="timer-outline"
          onPress={cycleTimer}
          active={timerMode > 0}
        />
        {timerMode > 0 && (
          <View style={styles.timerBadge}>
            <Text style={styles.timerBadgeText}>{timerMode}s</Text>
          </View>
        )}
      </View>

      {/* Photo Preview - absolute left */}
      <View style={[styles.photoPreviewContainer, { bottom: insets.bottom + 105 }]}>
        <PhotoPreview photo={lastPhoto} onPress={() => console.log('Open photo')} />
      </View>

      {/* Capture Button - absolute center */}
      <View style={[styles.captureButtonContainer, { bottom: insets.bottom + 85 }]}>
        <CaptureButton onCapture={handleCapture} disabled={isCapturing || !cameraReady} />
      </View>

      {/* Swap Camera - absolute right of capture */}
      <View style={[styles.swapCameraContainer, { bottom: insets.bottom + 105 }]}>
        <ControlButton icon="camera-reverse" onPress={toggleCamera} size={32} />
      </View>

      {/* Zoom Level Buttons */}
      <View style={[styles.zoomButtons, { bottom: insets.bottom + 185 }]}>
        {[1, 2, 3].map((level) => (
          <TouchableOpacity
            key={level}
            style={[styles.zoomButton, zoom >= level && zoom < level + 1 && styles.zoomButtonActive]}
            onPress={() => {
              setZoom(level);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <Text style={[styles.zoomButtonText, zoom >= level && zoom < level + 1 && styles.zoomButtonTextActive]}>
              {level}x
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  permissionTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#FFF',
    marginTop: 20,
    marginBottom: 10,
  },
  permissionText: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    marginBottom: 30,
  },
  permissionButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 30,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 15,
  },
  permissionButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  settingsButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  settingsButtonText: {
    color: '#007AFF',
    fontSize: 14,
  },

  // Focus indicator
  focusIndicator: {
    position: 'absolute',
    width: 80,
    height: 80,
    zIndex: 100,
  },
  focusBox: {
    width: 80,
    height: 80,
    borderWidth: 2,
    borderColor: '#007AFF',
    borderRadius: 8,
    backgroundColor: 'transparent',
  },

  // Zoom indicator
  zoomIndicator: {
    position: 'absolute',
    top: 120,
    alignSelf: 'center',
    zIndex: 100,
  },
  zoomBadge: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  zoomText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },

  // Exposure slider
  exposureContainer: {
    position: 'absolute',
    left: 16,
    top: '50%',
    transform: [{ translateY: -90 }],
    alignItems: 'center',
    zIndex: 100,
  },
  exposureTrack: {
    width: 44,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 22,
    paddingVertical: 8,
  },
  exposureTrackBg: {
    position: 'absolute',
    width: 3,
    top: 22,
    bottom: 22,
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderRadius: 1.5,
  },
  exposureZeroMark: {
    position: 'absolute',
    width: 14,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.8)',
    top: '50%',
    marginTop: -1,
    borderRadius: 1,
  },
  exposureThumb: {
    width: 28,
    height: 28,
    backgroundColor: '#FFD60A',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },

  // Grid overlay
  gridLine: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  gridVertical1: {
    left: '33.33%',
    top: 0,
    bottom: 0,
    width: 1,
  },
  gridVertical2: {
    left: '66.66%',
    top: 0,
    bottom: 0,
    width: 1,
  },
  gridHorizontal1: {
    top: '33.33%',
    left: 0,
    right: 0,
    height: 1,
  },
  gridHorizontal2: {
    top: '66.66%',
    left: 0,
    right: 0,
    height: 1,
  },

  // Timer overlay
  timerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 500,
  },
  timerText: {
    fontSize: 120,
    fontWeight: '200',
    color: '#FFF',
  },

  // Controls
  topControls: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    gap: 15,
    zIndex: 100,
  },
  controlButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerBadge: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  timerBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
  },

  // Bottom control containers
  photoPreviewContainer: {
    position: 'absolute',
    left: 30,
    zIndex: 100,
  },
  captureButtonContainer: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 100,
  },
  swapCameraContainer: {
    position: 'absolute',
    right: 30,
    zIndex: 100,
  },

  // Capture button
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  captureButtonInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFF',
  },

  // Zoom buttons
  zoomButtons: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 20,
    padding: 4,
    gap: 4,
    zIndex: 100,
  },
  zoomButton: {
    width: 40,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomButtonActive: {
    backgroundColor: '#007AFF',
  },
  zoomButtonText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
  zoomButtonTextActive: {
    color: '#FFF',
  },

  // Photo preview
  photoPreview: {
    width: 50,
    height: 50,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  photoPreviewImage: {
    width: '100%',
    height: '100%',
  },
});
