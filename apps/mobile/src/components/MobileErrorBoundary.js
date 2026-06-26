import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';

// App-level error boundary so a runtime crash degrades into a safe fallback
// instead of a white screen. It NEVER renders stack traces, tokens, or private
// data to normal users. In development (__DEV__) it may show a short sanitized
// error message only.
export class MobileErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
    this.handleRestart = this.handleRestart.bind(this);
    this.handleDiagnostics = this.handleDiagnostics.bind(this);
  }

  static getDerivedStateFromError(error) {
    // Keep only a short, sanitized message; never a stack trace or private data.
    const raw = error && error.message ? String(error.message) : '';
    const safe = raw.replace(/https?:\/\/\S+/gi, '').replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '').slice(0, 120);
    return { hasError: true, message: safe };
  }

  componentDidCatch() {
    // Intentionally no logging of the error payload (it may contain private data).
  }

  handleRestart() {
    this.setState({ hasError: false, message: '' });
    if (typeof this.props.onRestart === 'function') this.props.onRestart();
  }

  handleDiagnostics() {
    if (typeof this.props.onOpenDiagnostics === 'function') this.props.onOpenDiagnostics();
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    const showDevDetail = typeof __DEV__ !== 'undefined' && __DEV__ && this.state.message;
    return (
      <View style={styles.root} accessibilityRole="alert">
        <View style={styles.card}>
          <Text style={styles.title}>Something went wrong.</Text>
          <Text style={styles.body}>
            The app ran into a problem. Your data is safe — you can restart or open diagnostics.
          </Text>
          {showDevDetail ? <Text style={styles.devNote}>Dev detail: {this.state.message}</Text> : null}
          <Pressable style={styles.primary} onPress={this.handleRestart} accessibilityRole="button">
            <Text style={styles.primaryLabel}>Restart app</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={this.handleDiagnostics} accessibilityRole="button">
            <Text style={styles.secondaryLabel}>Open diagnostics</Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

const c = auroraTheme.colors;
const s = auroraTheme.spacing;
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.surface.canvas, alignItems: 'center', justifyContent: 'center', padding: auroraTheme.layout.screenPadding },
  card: { width: '100%', maxWidth: 420, gap: s.sm },
  title: { color: c.text.primary, fontSize: 18, fontWeight: '800' },
  body: { color: c.text.secondary, fontSize: 14, lineHeight: 20 },
  devNote: { color: c.text.muted, fontSize: 12 },
  primary: { backgroundColor: c.accent.progress, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: s.sm },
  primaryLabel: { color: '#1a1410', fontSize: 14, fontWeight: '800' },
  secondary: { borderColor: c.border.subtle, borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  secondaryLabel: { color: c.text.primary, fontSize: 14, fontWeight: '700' },
});

export default MobileErrorBoundary;
