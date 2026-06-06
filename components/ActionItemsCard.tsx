import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  FlatList, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, Typography, Radius, Shadow, Spacing } from '@/constants/theme';
import { ActionItem } from '@/lib/types';
import {
  getActionItems,
  addActionItem,
  toggleActionItem,
  deleteActionItem,
} from '@/lib/meetings';

interface Props {
  conversationId: string;
  currentUserId: string;
  themeColor?: string;
}

export default function ActionItemsCard({ conversationId, currentUserId, themeColor = Colors.primary }: Props) {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await getActionItems(conversationId);
    setItems(data);
    setLoading(false);
    if (data.length > 0) setExpanded(true);
  }, [conversationId]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    const trimmed = input.trim();
    if (!trimmed || adding) return;
    setAdding(true);
    const item = await addActionItem(conversationId, currentUserId, trimmed);
    if (item) {
      setItems((prev) => [...prev, item]);
      setInput('');
    }
    setAdding(false);
  };

  const handleToggle = async (item: ActionItem) => {
    const next = !item.completed;
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, completed: next } : i));
    await toggleActionItem(item.id, next);
  };

  const handleDelete = (item: ActionItem) => {
    if (item.created_by !== currentUserId) return;
    Alert.alert('Remove commitment', `Remove "${item.content}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          setItems((prev) => prev.filter((i) => i.id !== item.id));
          await deleteActionItem(item.id);
        },
      },
    ]);
  };

  const activeCount = items.filter((i) => !i.completed).length;
  const themeLight = themeColor + '18';
  const themeGlow = themeColor + '30';

  if (loading) return null;

  return (
    <View style={[styles.container, { borderColor: themeGlow }]}>
      {/* Header */}
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Collapse commitments' : 'Expand commitments'}
      >
        <View style={[styles.headerLeft, { backgroundColor: themeLight }]}>
          <Ionicons name="checkmark-circle-outline" size={15} color={themeColor} />
          <Text style={[styles.headerLabel, { color: themeColor }]}>Commitments</Text>
          {activeCount > 0 && (
            <View style={[styles.badge, { backgroundColor: themeColor }]}>
              <Text style={styles.badgeText}>{activeCount}</Text>
            </View>
          )}
        </View>
        <Ionicons
          name={expanded ? 'chevron-down' : 'chevron-up'}
          size={15}
          color={Colors.gray400}
        />
      </TouchableOpacity>

      {expanded && (
        <>
          {items.length === 0 ? (
            <Text style={styles.emptyText}>
              Add what you'll each commit to before your next call.
            </Text>
          ) : (
            <FlatList
              data={items}
              keyExtractor={(i) => i.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.item}
                  onPress={() => handleToggle(item)}
                  onLongPress={() => handleDelete(item)}
                  activeOpacity={0.7}
                  accessibilityRole="checkbox"
                  accessibilityLabel={item.content}
                >
                  <Ionicons
                    name={item.completed ? 'checkmark-circle' : 'ellipse-outline'}
                    size={20}
                    color={item.completed ? Colors.accent3 : Colors.gray400}
                  />
                  <Text style={[styles.itemText, item.completed && styles.itemTextDone]}>
                    {item.content}
                  </Text>
                  {item.created_by === currentUserId && (
                    <TouchableOpacity
                      onPress={() => handleDelete(item)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel="Remove"
                    >
                      <Ionicons name="close" size={14} color={Colors.gray300} />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          )}

          {/* Add input */}
          <View style={[styles.addRow, { borderTopColor: Colors.gray100 }]}>
            <TextInput
              style={styles.addInput}
              value={input}
              onChangeText={setInput}
              placeholder="Add a commitment..."
              placeholderTextColor={Colors.gray400}
              returnKeyType="done"
              onSubmitEditing={handleAdd}
              maxLength={500}
              accessibilityLabel="Add commitment"
            />
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: themeColor }, (!input.trim() || adding) && styles.addBtnDisabled]}
              onPress={handleAdd}
              disabled={!input.trim() || adding}
              accessibilityRole="button"
              accessibilityLabel="Add"
            >
              {adding
                ? <ActivityIndicator size="small" color={Colors.white} />
                : <Ionicons name="add" size={18} color={Colors.white} />
              }
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
  },
  headerLabel: {
    ...Typography.label,
    letterSpacing: 0.4,
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: Fonts.sansBold,
    color: Colors.white,
  },

  emptyText: {
    ...Typography.bodySm,
    color: Colors.gray400,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },

  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  itemText: {
    flex: 1,
    ...Typography.bodyMd,
    color: Colors.dark,
  },
  itemTextDone: {
    textDecorationLine: 'line-through',
    color: Colors.gray400,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.gray100,
    marginLeft: Spacing.md + 30,
  },

  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    gap: 8,
  },
  addInput: {
    flex: 1,
    height: 36,
    backgroundColor: Colors.background,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    fontSize: 14,
    color: Colors.dark,
    fontFamily: Fonts.sans,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnDisabled: {
    backgroundColor: Colors.gray300,
  },
});
