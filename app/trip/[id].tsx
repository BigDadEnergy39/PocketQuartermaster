import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, SectionList, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, TextInput, Modal, ScrollView,
} from 'react-native';
import { useLocalSearchParams, router, useNavigation, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';
import { useUnit } from '../../src/context/UnitContext';
import { useShoppingCategories, CategoryType } from '../../src/hooks/useShoppingCategories';
import { ItemTag } from '../../src/hooks/useShoppingList';

interface TripDetail {
  id: string;
  name: string;
  trip_date: string;
  return_date: string | null;
  headcount: number | null;
  notes: string | null;
}

interface TripItem {
  id: string;
  item_id: string | null;
  item_name: string;
  quantity_needed: number;
  quantity_purchased: number;
  store: string | null;
  is_purchased: boolean;
  notes: string | null;
  unit_price: number | null;
  tags: ItemTag[];
}

function fmt(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmt$(n: number | null | undefined) {
  if (n == null) return null;
  return `$${n.toFixed(2)}`;
}

function tagMap(tags: ItemTag[]): Record<string, string> {
  const m: Record<string, string> = {};
  for (const t of tags) m[t.type_id] = t.value;
  return m;
}

// ─── Autocomplete row ─────────────────────────────────────────────────────────
function AutocompleteRow({ values, onSelect }: { values: string[]; onSelect: (v: string) => void }) {
  if (!values.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.autocompleteRow} keyboardShouldPersistTaps="always">
      {values.map(v => (
        <TouchableOpacity key={v} style={styles.acChip} onPress={() => onSelect(v)}>
          <Text style={styles.acChipText}>{v}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

// ─── Item edit sheet ──────────────────────────────────────────────────────────
interface EditSheetProps {
  item: TripItem | null;
  tripId: string;
  categoryTypes: CategoryType[];
  tagValues: Record<string, string[]>;
  accent: string;
  onClose: () => void;
  onSaved: () => void;
}

function EditSheet({ item, tripId, categoryTypes, tagValues, accent, onClose, onSaved }: EditSheetProps) {
  const [name, setName] = useState(item?.item_name ?? '');
  const [qty, setQty] = useState(String(item?.quantity_needed ?? 1));
  const [price, setPrice] = useState(item?.unit_price != null ? String(item.unit_price) : '');
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [tags, setTags] = useState<Record<string, string>>(() => item ? tagMap(item.tags) : {});
  const [focusedCat, setFocusedCat] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isNew = !item;

  async function save() {
    if (!name.trim()) { Alert.alert('Name required'); return; }
    const qtyNum = parseInt(qty, 10);
    if (isNaN(qtyNum) || qtyNum < 1) { Alert.alert('Invalid quantity'); return; }
    const priceNum = price.trim() ? parseFloat(price) : null;
    if (price.trim() && (isNaN(priceNum!) || priceNum! < 0)) { Alert.alert('Invalid price'); return; }

    setSaving(true);
    let itemId = item?.id;

    if (isNew) {
      const { data, error } = await supabase.rpc('add_trip_shopping_item', {
        p_trip_id: tripId,
        p_item_name: name.trim(),
        p_quantity_needed: qtyNum,
        p_notes: notes.trim() || null,
        p_unit_price: priceNum,
      });
      if (error) { Alert.alert('Error', error.message); setSaving(false); return; }
      itemId = data as string;
    } else {
      const { error } = await supabase.rpc('update_trip_shopping_item', {
        p_id: item!.id,
        p_item_name: name.trim(),
        p_quantity_needed: qtyNum,
        p_notes: notes.trim() || null,
        p_unit_price: priceNum,
      });
      if (error) { Alert.alert('Error', error.message); setSaving(false); return; }
    }

    for (const ct of categoryTypes) {
      const val = (tags[ct.id] ?? '').trim();
      if (val) {
        await supabase.rpc('set_shopping_item_tag', {
          p_category_type_id: ct.id,
          p_value: val,
          p_trip_item_id: itemId,
        });
      } else if (!isNew) {
        await supabase.rpc('remove_shopping_item_tag', {
          p_category_type_id: ct.id,
          p_trip_item_id: item!.id,
        });
      }
    }

    setSaving(false);
    onSaved();
  }

  async function removeItem() {
    Alert.alert('Remove', `Remove "${item!.item_name}" from the list?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          await supabase.rpc('remove_trip_shopping_item', { p_id: item!.id });
          onSaved();
        },
      },
    ]);
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet">
      <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.modalTitle}>{isNew ? 'Add to Trip List' : 'Edit Item'}</Text>

        <Text style={styles.label}>Item</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName}
          placeholder="e.g. Hot dogs" placeholderTextColor="#aaa" autoFocus={isNew} />

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Quantity</Text>
            <TextInput style={styles.input} value={qty} onChangeText={setQty}
              keyboardType="numeric" placeholderTextColor="#aaa" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Price / Unit</Text>
            <TextInput style={styles.input} value={price} onChangeText={setPrice}
              keyboardType="decimal-pad" placeholder="$0.00" placeholderTextColor="#aaa" />
          </View>
        </View>

        <Text style={styles.label}>Notes (optional)</Text>
        <TextInput style={styles.input} value={notes} onChangeText={setNotes}
          placeholder="e.g. Get the family size" placeholderTextColor="#aaa" />

        {categoryTypes.length > 0 && (
          <>
            <Text style={[styles.label, { marginTop: 24 }]}>Categories</Text>
            {categoryTypes.map(ct => (
              <View key={ct.id}>
                <Text style={styles.catFieldLabel}>{ct.name}</Text>
                <TextInput
                  style={styles.input}
                  value={tags[ct.id] ?? ''}
                  onChangeText={v => setTags(prev => ({ ...prev, [ct.id]: v }))}
                  placeholder={`e.g. ${ct.name === 'Store' ? 'Costco' : ct.name}`}
                  placeholderTextColor="#aaa"
                  onFocus={() => setFocusedCat(ct.id)}
                  onBlur={() => setFocusedCat(null)}
                />
                {focusedCat === ct.id && (
                  <AutocompleteRow
                    values={(tagValues[ct.id] ?? []).filter(v =>
                      !tags[ct.id] || v.toLowerCase().includes(tags[ct.id].toLowerCase())
                    )}
                    onSelect={v => setTags(prev => ({ ...prev, [ct.id]: v }))}
                  />
                )}
              </View>
            ))}
          </>
        )}

        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: accent }, saving && styles.disabled]}
          onPress={save} disabled={saving}
        >
          <Text style={styles.saveBtnText}>{saving ? 'Saving…' : isNew ? 'Add to List' : 'Save Changes'}</Text>
        </TouchableOpacity>

        {!isNew && (
          <TouchableOpacity style={styles.removeBtn} onPress={removeItem}>
            <Text style={styles.removeBtnText}>Remove from List</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </Modal>
  );
}

// ─── Filter bar (shared logic, same UI as unit shopping) ──────────────────────
interface FilterState {
  filters: { typeId: string; typeName: string; value: string }[];
  groupBy: CategoryType | null;
}

function FilterBar({ state, categoryTypes, items, accent, onChange }: {
  state: FilterState; categoryTypes: CategoryType[]; items: TripItem[]; accent: string;
  onChange: (s: FilterState) => void;
}) {
  const [showSheet, setShowSheet] = useState(false);
  const [pickType, setPickType] = useState<CategoryType | null>(null);

  if (!categoryTypes.length) return null;

  function removeFilter(idx: number) {
    onChange({ ...state, filters: state.filters.filter((_, i) => i !== idx) });
  }

  function addFilter(typeId: string, typeName: string, value: string) {
    const existing = state.filters.findIndex(f => f.typeId === typeId);
    const next = [...state.filters];
    if (existing >= 0) next[existing] = { typeId, typeName, value };
    else next.push({ typeId, typeName, value });
    onChange({ ...state, filters: next });
    setPickType(null);
    setShowSheet(false);
  }

  function setGroupBy(cat: CategoryType | null) {
    onChange({ ...state, groupBy: cat });
    setShowSheet(false);
  }

  const pickValues = pickType
    ? [...new Set(items.flatMap(i => i.tags).filter(t => t.type_id === pickType.id).map(t => t.value))]
    : [];

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={styles.filterBarInner}>
        <TouchableOpacity style={[styles.filterPill, { borderColor: accent }]} onPress={() => setShowSheet(true)}>
          <Text style={[styles.filterPillText, { color: accent }]}>⚙ View</Text>
        </TouchableOpacity>
        {state.filters.map((f, i) => (
          <TouchableOpacity key={i} style={[styles.filterPill, { backgroundColor: accent, borderColor: accent }]} onPress={() => removeFilter(i)}>
            <Text style={styles.filterPillActiveText}>{f.typeName}: {f.value} ✕</Text>
          </TouchableOpacity>
        ))}
        {state.groupBy && (
          <TouchableOpacity style={[styles.filterPill, { borderColor: '#888' }]} onPress={() => setGroupBy(null)}>
            <Text style={[styles.filterPillText, { color: '#555' }]}>Group: {state.groupBy.name} ✕</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <Modal visible={showSheet} animationType="slide" transparent>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => { setPickType(null); setShowSheet(false); }}>
          <View style={styles.sheet}>
            {pickType ? (
              <>
                <Text style={styles.sheetTitle}>Filter by {pickType.name}</Text>
                {pickValues.length === 0
                  ? <Text style={styles.sheetEmpty}>No values used yet.</Text>
                  : pickValues.map(v => (
                    <TouchableOpacity key={v} style={styles.sheetRow} onPress={() => addFilter(pickType.id, pickType.name, v)}>
                      <Text style={styles.sheetRowText}>{v}</Text>
                    </TouchableOpacity>
                  ))}
                <TouchableOpacity style={styles.sheetBackBtn} onPress={() => setPickType(null)}>
                  <Text style={[styles.sheetBackText, { color: accent }]}>← Back</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.sheetTitle}>Filter & Group</Text>
                <Text style={styles.sheetSection}>Filter by</Text>
                {categoryTypes.map(ct => (
                  <TouchableOpacity key={ct.id} style={styles.sheetRow} onPress={() => setPickType(ct)}>
                    <Text style={styles.sheetRowText}>{ct.name}</Text>
                    <Text style={styles.sheetRowArrow}>›</Text>
                  </TouchableOpacity>
                ))}
                <Text style={styles.sheetSection}>Group by</Text>
                <TouchableOpacity style={styles.sheetRow} onPress={() => setGroupBy(null)}>
                  <Text style={[styles.sheetRowText, !state.groupBy && { color: accent, fontWeight: '700' }]}>None</Text>
                  {!state.groupBy && <Text style={[styles.sheetRowArrow, { color: accent }]}>✓</Text>}
                </TouchableOpacity>
                {categoryTypes.map(ct => (
                  <TouchableOpacity key={ct.id} style={styles.sheetRow} onPress={() => setGroupBy(ct)}>
                    <Text style={[styles.sheetRowText, state.groupBy?.id === ct.id && { color: accent, fontWeight: '700' }]}>{ct.name}</Text>
                    {state.groupBy?.id === ct.id && <Text style={[styles.sheetRowArrow, { color: accent }]}>✓</Text>}
                  </TouchableOpacity>
                ))}
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function TripDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { currentUnit } = useUnit();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { categoryTypes, tagValues, refetch: refetchCats } = useShoppingCategories(currentUnit?.id);

  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [items, setItems] = useState<TripItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [editItem, setEditItem] = useState<TripItem | null>(null);
  const [filterState, setFilterState] = useState<FilterState>({ filters: [], groupBy: null });

  const accent = currentUnit?.accent_color ?? '#2d5a27';

  async function load() {
    if (!id) return;
    const [tripRes, itemsRes] = await Promise.all([
      supabase.from('trips').select('id,name,trip_date,return_date,headcount,notes').eq('id', id).single(),
      supabase.rpc('get_trip_shopping_items', { p_trip_id: id }),
    ]);
    if (tripRes.data) setTrip(tripRes.data);
    if (!itemsRes.error && itemsRes.data) setItems(itemsRes.data);
    setLoading(false);
  }

  useEffect(() => { load(); }, [id]);
  useFocusEffect(useCallback(() => { load(); refetchCats(); }, [id]));

  useEffect(() => {
    if (!trip) return;
    navigation.setOptions({
      title: trip.name,
      headerRight: () => (
        <TouchableOpacity onPress={confirmDelete} style={{ marginRight: 16 }}>
          <Text style={{ color: '#c0392b', fontSize: 15, fontWeight: '600' }}>Delete</Text>
        </TouchableOpacity>
      ),
    });
  }, [trip]);

  async function toggle(item: TripItem) {
    await supabase.rpc('toggle_trip_item_purchased', { p_id: item.id });
    load();
  }

  function confirmDelete() {
    Alert.alert('Delete Trip', `Delete "${trip?.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          await supabase.rpc('delete_trip', { p_trip_id: id });
          router.replace('/(tabs)/trips');
        },
      },
    ]);
  }

  const filteredItems = useMemo(() => {
    if (!filterState.filters.length) return items;
    return items.filter(item =>
      filterState.filters.every(f =>
        item.tags.some(t => t.type_id === f.typeId && t.value === f.value)
      )
    );
  }, [items, filterState.filters]);

  const unpurchased = filteredItems.filter(i => !i.is_purchased);
  const purchased = filteredItems.filter(i => i.is_purchased);

  const cartTotal = useMemo(() => {
    const w = purchased.filter(i => i.unit_price != null);
    if (!w.length) return null;
    return w.reduce((s, i) => s + i.unit_price! * i.quantity_needed, 0);
  }, [purchased]);

  const estimatedRemaining = useMemo(() => {
    const w = unpurchased.filter(i => i.unit_price != null);
    if (!w.length) return null;
    return w.reduce((s, i) => s + i.unit_price! * i.quantity_needed, 0);
  }, [unpurchased]);

  function buildSections(list: TripItem[]) {
    if (!filterState.groupBy) return null;
    const typeId = filterState.groupBy.id;
    const groups: Record<string, TripItem[]> = {};
    for (const item of list) {
      const val = item.tags.find(t => t.type_id === typeId)?.value ?? '—';
      if (!groups[val]) groups[val] = [];
      groups[val].push(item);
    }
    return Object.entries(groups)
      .sort(([a], [b]) => (a === '—' ? 1 : b === '—' ? -1 : a.localeCompare(b)))
      .map(([title, data]) => ({ title, data }));
  }

  function renderCard(item: TripItem) {
    return (
      <TouchableOpacity
        style={[styles.card, item.is_purchased && styles.cardDone]}
        onPress={() => { setEditItem(item); setShowEdit(true); }}
        activeOpacity={0.8}
      >
        <TouchableOpacity
          style={[styles.checkbox, item.is_purchased && { backgroundColor: accent, borderColor: accent }]}
          onPress={() => toggle(item)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {item.is_purchased && <Text style={styles.checkmark}>✓</Text>}
        </TouchableOpacity>
        <View style={styles.cardBody}>
          <View style={styles.cardTopRow}>
            <Text style={[styles.itemName, item.is_purchased && styles.strike]} numberOfLines={1}>
              {item.item_name}
            </Text>
            {item.unit_price != null && (
              <Text style={[styles.priceLabel, item.is_purchased && styles.strike]}>
                {fmt$(item.unit_price! * item.quantity_needed)}
              </Text>
            )}
          </View>
          <Text style={styles.itemMeta}>
            Qty: {item.quantity_needed}
            {item.unit_price != null ? ` · ${fmt$(item.unit_price)}/unit` : ''}
            {item.notes ? ` · ${item.notes}` : ''}
          </Text>
          {item.tags.length > 0 && (
            <View style={styles.tagRow}>
              {item.tags.map(t => (
                <View key={t.type_id} style={styles.tagChip}>
                  <Text style={styles.tagChipText}>{t.type_name}: {t.value}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  if (loading || !trip) {
    return <View style={styles.center}><ActivityIndicator color={accent} /></View>;
  }

  const sections = filterState.groupBy ? buildSections(unpurchased) : null;

  const TripHeader = () => (
    <View>
      <View style={styles.infoCard}>
        <Text style={styles.infoDate}>
          🗓 {fmt(trip.trip_date)}
          {trip.return_date && trip.return_date !== trip.trip_date ? ` – ${fmt(trip.return_date)}` : ''}
        </Text>
        {trip.headcount && <Text style={styles.infoMeta}>👥 {trip.headcount} people</Text>}
        {trip.notes && <Text style={styles.infoNotes}>{trip.notes}</Text>}
        {items.length > 0 && (
          <View style={styles.progressRow}>
            <View style={styles.progressBg}>
              <View style={[styles.progressFill, {
                width: `${Math.round((purchased.length / items.length) * 100)}%` as any,
                backgroundColor: accent,
              }]} />
            </View>
            <Text style={styles.progressLabel}>{purchased.length}/{items.length}</Text>
          </View>
        )}
      </View>
      <FilterBar state={filterState} categoryTypes={categoryTypes} items={items} accent={accent} onChange={setFilterState} />
      {(cartTotal != null || estimatedRemaining != null) && (
        <View style={styles.cartBanner}>
          {cartTotal != null && <Text style={styles.cartText}>In cart: <Text style={[styles.cartAmount, { color: accent }]}>{fmt$(cartTotal)}</Text></Text>}
          {estimatedRemaining != null && <Text style={styles.cartText}>Remaining: ~{fmt$(estimatedRemaining)}</Text>}
        </View>
      )}
      {unpurchased.length > 0 && (
        <Text style={styles.sectionHeader}>{unpurchased.length} item{unpurchased.length !== 1 ? 's' : ''} to get</Text>
      )}
    </View>
  );

  const TripFooter = () => purchased.length > 0 ? (
    <Text style={[styles.sectionHeader, { marginTop: 24 }]}>Purchased ({purchased.length})</Text>
  ) : null;

  return (
    <View style={styles.container}>
      {sections ? (
        <SectionList
          sections={sections}
          keyExtractor={i => i.id}
          contentContainerStyle={[styles.list, { paddingBottom: 100 + insets.bottom }]}
          ListHeaderComponent={<TripHeader />}
          ListFooterComponent={<TripFooter />}
          renderSectionHeader={({ section }) => <Text style={styles.groupHeader}>{section.title}</Text>}
          renderItem={({ item }) => renderCard(item)}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>📋</Text>
              <Text style={styles.emptyTitle}>No items yet</Text>
              <Text style={styles.emptySub}>Build the shopping list for this trip.</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={i => i.id}
          contentContainerStyle={[styles.list, { paddingBottom: 100 + insets.bottom }]}
          ListHeaderComponent={<TripHeader />}
          ListFooterComponent={<TripFooter />}
          renderItem={({ item }) => renderCard(item)}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>📋</Text>
              <Text style={styles.emptyTitle}>No items yet</Text>
              <Text style={styles.emptySub}>Build the shopping list for this trip.</Text>
            </View>
          }
        />
      )}

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: accent, bottom: 24 + insets.bottom }]}
        onPress={() => { setEditItem(null); setShowEdit(true); }}
      >
        <Text style={styles.fabText}>+ Add Item</Text>
      </TouchableOpacity>

      {showEdit && (
        <EditSheet
          item={editItem}
          tripId={id!}
          categoryTypes={categoryTypes}
          tagValues={tagValues}
          accent={accent}
          onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); load(); refetchCats(); }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f0e8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f0e8' },
  list: { padding: 16 },
  infoCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  infoDate: { fontSize: 15, color: '#333', marginBottom: 4 },
  infoMeta: { fontSize: 14, color: '#666', marginBottom: 4 },
  infoNotes: { fontSize: 13, color: '#999', marginTop: 4, fontStyle: 'italic' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  progressBg: { flex: 1, height: 6, backgroundColor: '#eee', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  progressLabel: { fontSize: 12, color: '#aaa', width: 36, textAlign: 'right' },
  filterBar: { marginHorizontal: -16, marginBottom: 8 },
  filterBarInner: { paddingHorizontal: 16, gap: 8, flexDirection: 'row', alignItems: 'center' },
  filterPill: { borderWidth: 1.5, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12 },
  filterPillText: { fontSize: 13, fontWeight: '600' },
  filterPillActiveText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  cartBanner: {
    backgroundColor: '#fff', borderRadius: 10, padding: 12,
    marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between',
    borderWidth: 1, borderColor: '#e0d8cc',
  },
  cartText: { fontSize: 13, color: '#666' },
  cartAmount: { fontWeight: '700' },
  sectionHeader: { fontSize: 13, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  groupHeader: { fontSize: 12, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginTop: 16, marginBottom: 6 },
  card: {
    flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#fff',
    borderRadius: 12, padding: 14, gap: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  cardDone: { opacity: 0.6 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#ccc', justifyContent: 'center', alignItems: 'center', marginTop: 1, flexShrink: 0 },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: '700' },
  cardBody: { flex: 1 },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  itemName: { fontSize: 16, fontWeight: '600', color: '#1a1a1a', flex: 1 },
  priceLabel: { fontSize: 14, fontWeight: '700', color: '#1a1a1a', marginLeft: 8 },
  strike: { textDecorationLine: 'line-through', color: '#aaa' },
  itemMeta: { fontSize: 13, color: '#999', marginTop: 2 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  tagChip: { backgroundColor: '#f0ebe3', borderRadius: 6, paddingVertical: 2, paddingHorizontal: 7 },
  tagChipText: { fontSize: 11, color: '#666', fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingTop: 40 },
  emptyEmoji: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#1a1a1a', marginBottom: 6 },
  emptySub: { fontSize: 14, color: '#888', textAlign: 'center', paddingHorizontal: 32 },
  fab: {
    position: 'absolute', left: 24, right: 24, padding: 16, borderRadius: 12,
    alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, elevation: 4,
  },
  fabText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  modal: { flex: 1, backgroundColor: '#f5f0e8' },
  modalContent: { padding: 24, paddingBottom: 60 },
  modalTitle: { fontSize: 22, fontWeight: '700', color: '#1a1a1a', marginBottom: 24 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  label: { fontSize: 13, fontWeight: '700', color: '#555', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 20 },
  catFieldLabel: { fontSize: 13, color: '#888', marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#fff', borderRadius: 10, padding: 14, fontSize: 16, color: '#1a1a1a', borderWidth: 1, borderColor: '#e0d8cc' },
  autocompleteRow: { marginTop: 4, marginBottom: 4 },
  acChip: { backgroundColor: '#e8f0e8', borderRadius: 16, paddingVertical: 5, paddingHorizontal: 12, marginRight: 6 },
  acChipText: { fontSize: 13, color: '#2d5a27', fontWeight: '600' },
  saveBtn: { padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 32 },
  disabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  removeBtn: { padding: 16, alignItems: 'center', marginTop: 8 },
  removeBtnText: { color: '#c0392b', fontSize: 15, fontWeight: '600' },
  cancelBtn: { padding: 16, alignItems: 'center', marginTop: 4 },
  cancelText: { color: '#888', fontSize: 15 },
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: '#1a1a1a', marginBottom: 16 },
  sheetSection: { fontSize: 11, fontWeight: '700', color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginTop: 16, marginBottom: 4 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f0ebe3' },
  sheetRowText: { flex: 1, fontSize: 16, color: '#1a1a1a' },
  sheetRowArrow: { fontSize: 18, color: '#ccc' },
  sheetEmpty: { color: '#aaa', fontSize: 14, paddingVertical: 12 },
  sheetBackBtn: { paddingTop: 16 },
  sheetBackText: { fontSize: 15, fontWeight: '600' },
});
