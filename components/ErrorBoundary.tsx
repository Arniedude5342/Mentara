import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { logError } from '@/lib/logger';

interface Props {
  children: React.ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: string | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState({ errorInfo: info.componentStack ?? null });
    logError('ErrorBoundary', error, { componentStack: info.componentStack ?? undefined });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={styles.root}>
        <ScrollView
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
        >
          {/* Icon */}
          <View style={styles.iconWrap}>
            <View style={styles.iconRing}>
              <Ionicons name="alert-circle-outline" size={40} color={Colors.accent2} />
            </View>
          </View>

          <Text style={styles.title}>
            {this.props.fallbackTitle ?? 'Something went wrong'}
          </Text>
          <Text style={styles.body}>
            The app hit an unexpected error. This has been logged. Try going back or restarting the app.
          </Text>

          {/* Error detail (collapsible in dev) */}
          {__DEV__ && this.state.error && (
            <View style={styles.devBox}>
              <Text style={styles.devLabel}>Error (dev only)</Text>
              <Text style={styles.devText} selectable>
                {this.state.error.message}
              </Text>
              {this.state.errorInfo && (
                <Text style={styles.devStack} selectable numberOfLines={8}>
                  {this.state.errorInfo.trim()}
                </Text>
              )}
            </View>
          )}

          {/* Retry */}
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={this.handleRetry}
            activeOpacity={0.85}
            accessibilityLabel="Try again"
            accessibilityRole="button"
          >
            <Ionicons name="refresh-outline" size={18} color={Colors.white} />
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>

          <Text style={styles.hint}>
            If this keeps happening, restart the app or contact support.
          </Text>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xxl,
    gap: Spacing.md,
  },
  iconWrap: {
    marginBottom: Spacing.sm,
  },
  iconRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.accent2Light,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.accent2Glow,
    ...Shadow.md,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.dark,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  body: {
    fontSize: 15,
    color: Colors.gray500,
    textAlign: 'center',
    lineHeight: 23,
    maxWidth: 320,
  },
  devBox: {
    width: '100%',
    backgroundColor: Colors.gray100,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: Spacing.sm,
  },
  devLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.accent2,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  devText: {
    fontSize: 12,
    color: Colors.error,
    fontWeight: '600',
  },
  devStack: {
    fontSize: 11,
    color: Colors.gray500,
    lineHeight: 17,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginTop: Spacing.sm,
    ...Shadow.teal,
  },
  retryText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.white,
  },
  hint: {
    fontSize: 12,
    color: Colors.gray400,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
});
