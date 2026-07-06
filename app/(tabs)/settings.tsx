import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Share, ActivityIndicator,
} from 'react-native';
import { showAlert } from '../../src/lib/alert';
import { useFocusEffect, router } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useUnit } from '../../src/context/UnitContext';
import { useUnits } from '../../src/hooks/useUnits';
import { ColorPicker } from '../../src/components/ColorPicker';
import { useShoppingCategories, CategoryType } from '../../src/hooks/useShoppingCategories';

interface Member { user_id: string; display_name: string; role: string; joined_at: string; }
interface InviteCode { id: string; code: string; use_count: number; max_uses: number | null; expires_at: string | null; }

function roleLabel(role: string) {
  return role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const ROLE_OPTIONS = [
  'quartermaster',
  'assistant_quartermaster',
  'youth_quartermaster',
  'member',
] as const;

export default function Settings() {
  const { currentUnit, setCurrentUnit } = useUnit();
  const [userId, setUserId] = useState<string | undefined>();
  const { units, refetch: refetchUnits } = useUnits(userId);

  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  // Unit editing (QM only)
  const [editingUnit, setEditingUnit] = useState(false);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [savingUnit, setSavingUnit] = useState(false);

  // Display name editing
  const [displayName, setDisplayName] = useState('');
  const [savingName, setSavingName] = useState(false);

  // Unit deletion (full QM-tier only) — gated behind typing the unit name
  const [deletingUnit, setDeletingUnit] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleteInProgress, setDeleteInProgress] = useState(false);

  const myRole = units.find(u => u.id === currentUnit?.id)?.role ?? 'member';
  const isQM = myRole === 'quartermaster' || myRole === 'assistant_quartermaster';
  const isFullQM = myRole === 'quartermaster';

  // Member role management (QM/AQM only)
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);
  const [savingRole, setSavingRole] = useState(false);

  const { categoryTypes, refetch: refetchCategories } = useShoppingCategories(currentUnit?.id);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [addingCat, setAddingCat] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id);
    });
    loadProfile();
  }, []);

  useFocusEffect(useCallback(() => {
    if (currentUnit) loadUnitData();
  }, [currentUnit?.id]));

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('profiles').select('display_name').eq('id', user.id).single();
    if (data?.display_name) setDisplayName(data.display_name);
  }

  async function loadUnitData() {
    if (!currentUnit) return;
    setLoading(true);
    const [membersRes, invitesRes] = await Promise.all([
      supabase.rpc('get_unit_members', { p_unit_id: currentUnit.id }),
      supabase.rpc('get_invite_codes', { p_unit_id: currentUnit.id }),
    ]);
    if (!membersRes.error) setMembers(membersRes.data ?? []);
    if (!invitesRes.error) setInvites(invitesRes.data ?? []);
    setLoading(false);
  }

  async function saveDisplayName() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setSavingName(true);
    const { error } = await supabase.from('profiles').update({ display_name: displayName.trim() }).eq('id', user.id);
    setSavingName(false);
    if (error) showAlert('Error', error.message);
    else showAlert('Saved', 'Display name updated.');
  }

  async function generateCode() {
    if (!currentUnit) return;
    setGenerating(true);
    const { data: code, error } = await supabase.rpc('generate_invite_code', { p_unit_id: currentUnit.id });
    setGenerating(false);
    if (error) { showAlert('Error', error.message); return; }
    await loadUnitData();
    shareCode(code);
  }

  async function shareCode(code: string) {
    await Share.share({
      message: `Join ${currentUnit?.name} on PocketQuartermaster!\n\nInvite code: ${code}\n\nDownload the app and use "Join with Invite Code" to get started.`,
    });
  }

  async function deactivateCode(invite: InviteCode) {
    showAlert('Deactivate Code', `Deactivate code ${invite.code}? It can no longer be used to join.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Deactivate', style: 'destructive', onPress: async () => {
          await supabase.rpc('deactivate_invite_code', { p_invite_id: invite.id });
          loadUnitData();
        },
      },
    ]);
  }

  function changeRole(member: Member, newRole: string) {
    if (member.role === newRole) { setExpandedMemberId(null); return; }
    const isSelf = member.user_id === userId;
    showAlert(
      'Change Role',
      `Change ${isSelf ? 'your role' : member.display_name} to ${roleLabel(newRole)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Change', onPress: async () => {
            setSavingRole(true);
            const { error } = await supabase.rpc('set_member_role', {
              p_unit_id: currentUnit!.id,
              p_user_id: member.user_id,
              p_role: newRole,
            });
            setSavingRole(false);
            if (error) { showAlert('Error', error.message); return; }
            setExpandedMemberId(null);
            await loadUnitData();
            if (isSelf) refetchUnits(); // my own role changed — refresh derived permissions
          },
        },
      ],
    );
  }

  async function saveCategoryName(cat: CategoryType) {
    const name = editingCatName.trim();
    if (!name) { showAlert('Name required'); return; }
    await supabase.rpc('upsert_shopping_category_type', { p_unit_id: currentUnit!.id, p_name: name, p_id: cat.id });
    setEditingCatId(null);
    refetchCategories();
  }

  async function addCategory() {
    const name = newCatName.trim();
    if (!name) return;
    await supabase.rpc('upsert_shopping_category_type', { p_unit_id: currentUnit!.id, p_name: name });
    setNewCatName('');
    setAddingCat(false);
    refetchCategories();
  }

  function confirmDeleteCategory(cat: CategoryType) {
    showAlert('Delete Category', `Delete "${cat.name}"? All tags using this category will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          await supabase.rpc('delete_shopping_category_type', { p_id: cat.id });
          refetchCategories();
        },
      },
    ]);
  }

  async function saveUnitSettings() {
    if (!currentUnit || !editName.trim()) { showAlert('Name required'); return; }
    setSavingUnit(true);
    const { error } = await supabase.rpc('update_unit', {
      p_unit_id: currentUnit.id,
      p_name: editName.trim(),
      p_accent_color: editColor,
    });
    setSavingUnit(false);
    if (error) { showAlert('Error', error.message); return; }
    setCurrentUnit({ ...currentUnit, name: editName.trim(), accent_color: editColor });
    setEditingUnit(false);
  }

  // The typed name must match exactly before deletion is allowed.
  const deleteNameMatches = deleteConfirmName.trim() === currentUnit?.name;

  function confirmDeleteUnit() {
    if (!currentUnit || !deleteNameMatches) return;
    showAlert(
      'Delete Unit',
      `This permanently deletes "${currentUnit.name}" and ALL of its data — containers, items, quantities, audits, shopping lists, invite codes, and every member's access. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete Forever', style: 'destructive', onPress: performDeleteUnit },
      ],
    );
  }

  async function performDeleteUnit() {
    if (!currentUnit) return;
    const deletedId = currentUnit.id;
    setDeleteInProgress(true);
    const { error } = await supabase.rpc('delete_unit', { p_unit_id: deletedId });
    setDeleteInProgress(false);
    if (error) { showAlert('Error', error.message); return; }

    // Route away from the now-deleted unit. Pick another unit if the user still
    // belongs to one, otherwise send them back to onboarding.
    const remaining = units.filter(u => u.id !== deletedId);
    setDeletingUnit(false);
    setDeleteConfirmName('');
    if (remaining.length > 0) {
      setCurrentUnit(remaining[0]);
      refetchUnits();
      router.replace('/(tabs)');
    } else {
      refetchUnits();
      router.replace('/onboarding');
    }
  }

  if (!currentUnit) {
    return <View style={styles.center}><Text style={styles.empty}>No unit selected.</Text></View>;
  }

  const accent = currentUnit.accent_color;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">

      {/* Unit header */}
      <View style={[styles.unitBanner, { backgroundColor: accent }]}>
        <Text style={styles.unitBannerName}>{currentUnit.name}</Text>
        <Text style={styles.unitBannerRole}>{roleLabel(myRole)}</Text>
      </View>

      {/* Display name */}
      <Text style={styles.sectionHeader}>Your Profile</Text>
      <View style={styles.card}>
        <Text style={styles.fieldLabel}>Display Name</Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="How others see your name"
            placeholderTextColor="#aaa"
          />
          <TouchableOpacity
            style={[styles.inlineBtn, { backgroundColor: accent }, savingName && styles.disabled]}
            onPress={saveDisplayName}
            disabled={savingName}
          >
            <Text style={styles.inlineBtnText}>{savingName ? '…' : 'Save'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Members */}
      <Text style={styles.sectionHeader}>Members ({members.length})</Text>
      <View style={styles.card}>
        {loading ? <ActivityIndicator color={accent} /> : members.map((m, i) => {
          // AQMs may manage everyone except the full QM and the QM role itself.
          const canEdit = isQM && (isFullQM || m.role !== 'quartermaster');
          const expanded = expandedMemberId === m.user_id;
          return (
            <View key={m.user_id} style={i < members.length - 1 && styles.memberDivider}>
              <TouchableOpacity
                activeOpacity={canEdit ? 0.6 : 1}
                onPress={() => canEdit && setExpandedMemberId(expanded ? null : m.user_id)}
                style={styles.memberRow}
              >
                <View style={[styles.avatar, { backgroundColor: accent }]}>
                  <Text style={styles.avatarText}>{(m.display_name?.[0] ?? '?').toUpperCase()}</Text>
                </View>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>
                    {m.display_name}{m.user_id === userId ? ' (you)' : ''}
                  </Text>
                  <Text style={styles.memberRole}>{roleLabel(m.role)}</Text>
                </View>
                {canEdit && <Text style={styles.chevron}>{expanded ? '▾' : '›'}</Text>}
              </TouchableOpacity>
              {expanded && (
                <View style={styles.rolePicker}>
                  {ROLE_OPTIONS.map(role => {
                    const selected = m.role === role;
                    // Only a full QM may assign the quartermaster role.
                    const disabled = savingRole || (role === 'quartermaster' && !isFullQM);
                    return (
                      <TouchableOpacity
                        key={role}
                        disabled={disabled}
                        onPress={() => changeRole(m, role)}
                        style={[
                          styles.roleChip,
                          selected && { backgroundColor: accent, borderColor: accent },
                          disabled && !selected && styles.roleChipDisabled,
                        ]}
                      >
                        <Text style={[
                          styles.roleChipText,
                          selected && { color: '#fff' },
                          disabled && !selected && { color: '#c4bdb2' },
                        ]}>
                          {roleLabel(role)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}
      </View>

      {/* Invite codes (QMs only) */}
      {isQM && (
        <>
          <Text style={styles.sectionHeader}>Invite Codes</Text>
          <View style={styles.card}>
            {invites.length === 0
              ? <Text style={styles.emptyCard}>No active codes. Generate one to invite members.</Text>
              : invites.map(invite => (
                <View key={invite.id} style={styles.inviteRow}>
                  <View style={styles.inviteInfo}>
                    <Text style={styles.inviteCode}>{invite.code}</Text>
                    <Text style={styles.inviteMeta}>
                      {invite.use_count} used{invite.max_uses ? ` / ${invite.max_uses} max` : ''}
                      {invite.expires_at ? ` · expires ${new Date(invite.expires_at).toLocaleDateString()}` : ''}
                    </Text>
                  </View>
                  <View style={styles.inviteActions}>
                    <TouchableOpacity onPress={() => shareCode(invite.code)} style={styles.shareBtn}>
                      <Text style={[styles.shareBtnText, { color: accent }]}>Share</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deactivateCode(invite)}>
                      <Text style={styles.deactivateBtn}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            }
            <TouchableOpacity
              style={[styles.generateBtn, { borderColor: accent }, generating && styles.disabled]}
              onPress={generateCode}
              disabled={generating}
            >
              <Text style={[styles.generateBtnText, { color: accent }]}>
                {generating ? 'Generating…' : '+ Generate Invite Code'}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Unit settings (QMs only) */}
      {isQM && (
        <>
          <Text style={styles.sectionHeader}>Unit Settings</Text>
          <View style={styles.card}>
            {!editingUnit ? (
              <TouchableOpacity
                style={[styles.generateBtn, { borderColor: accent }]}
                onPress={() => { setEditName(currentUnit.name); setEditColor(accent); setEditingUnit(true); }}
              >
                <Text style={[styles.generateBtnText, { color: accent }]}>Edit Unit Name & Color</Text>
              </TouchableOpacity>
            ) : (
              <>
                <Text style={styles.fieldLabel}>Unit Name</Text>
                <TextInput style={styles.input} value={editName} onChangeText={setEditName} placeholderTextColor="#aaa" />
                <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Unit Color</Text>
                <ColorPicker selected={editColor} onSelect={setEditColor} />
                <View style={[styles.previewBanner, { backgroundColor: editColor }]}>
                  <Text style={styles.previewText}>{editName || 'Unit Name'}</Text>
                </View>
                <View style={styles.row}>
                  <TouchableOpacity
                    style={[styles.saveUnitBtn, { backgroundColor: editColor }, savingUnit && styles.disabled]}
                    onPress={saveUnitSettings}
                    disabled={savingUnit}
                  >
                    <Text style={styles.saveBtnText}>{savingUnit ? 'Saving…' : 'Save'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.cancelUnitBtn} onPress={() => setEditingUnit(false)}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </>
      )}

      {/* Danger zone — delete unit (QMs only) */}
      {isQM && (
        <>
          <Text style={styles.sectionHeader}>Danger Zone</Text>
          <View style={styles.card}>
            {!deletingUnit ? (
              <TouchableOpacity
                style={styles.deleteUnitBtn}
                onPress={() => { setDeleteConfirmName(''); setDeletingUnit(true); }}
              >
                <Text style={styles.deleteUnitBtnText}>Delete Unit</Text>
              </TouchableOpacity>
            ) : (
              <>
                <Text style={styles.dangerText}>
                  Deleting "{currentUnit.name}" permanently removes all of its containers,
                  items, quantities, audits, shopping lists, invite codes, and every member's
                  access. This cannot be undone.
                </Text>
                <Text style={[styles.fieldLabel, { marginTop: 12 }]}>
                  Type the unit name to confirm
                </Text>
                <TextInput
                  style={styles.input}
                  value={deleteConfirmName}
                  onChangeText={setDeleteConfirmName}
                  placeholder={currentUnit.name}
                  placeholderTextColor="#aaa"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <View style={[styles.row, { marginTop: 12 }]}>
                  <TouchableOpacity
                    style={[
                      styles.deleteConfirmBtn,
                      (!deleteNameMatches || deleteInProgress) && styles.disabled,
                    ]}
                    onPress={confirmDeleteUnit}
                    disabled={!deleteNameMatches || deleteInProgress}
                  >
                    <Text style={styles.saveBtnText}>
                      {deleteInProgress ? 'Deleting…' : 'Delete Unit'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cancelUnitBtn}
                    onPress={() => { setDeletingUnit(false); setDeleteConfirmName(''); }}
                  >
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </>
      )}

      {/* Shopping categories */}
      <Text style={styles.sectionHeader}>Shopping Categories</Text>
      <View style={styles.card}>
        <Text style={styles.fieldLabel}>
          Define custom grouping dimensions for your shopping lists (e.g. Store, Section, Shopper).
        </Text>
        {categoryTypes.map((cat, i) => (
          <View key={cat.id} style={[styles.memberRow, i < categoryTypes.length - 1 && styles.memberDivider]}>
            {editingCatId === cat.id ? (
              <View style={[styles.row, { flex: 1 }]}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={editingCatName}
                  onChangeText={setEditingCatName}
                  autoFocus
                  onSubmitEditing={() => saveCategoryName(cat)}
                />
                <TouchableOpacity style={[styles.inlineBtn, { backgroundColor: accent }]} onPress={() => saveCategoryName(cat)}>
                  <Text style={styles.inlineBtnText}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.inlineBtn, { backgroundColor: '#eee' }]} onPress={() => setEditingCatId(null)}>
                  <Text style={[styles.inlineBtnText, { color: '#666' }]}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={[styles.memberName, { flex: 1 }]}>{cat.name}</Text>
                <TouchableOpacity onPress={() => { setEditingCatId(cat.id); setEditingCatName(cat.name); }} style={{ padding: 6 }}>
                  <Text style={[styles.shareBtnText, { color: accent }]}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => confirmDeleteCategory(cat)} style={{ padding: 6 }}>
                  <Text style={styles.deactivateBtn}>✕</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        ))}
        {categoryTypes.length === 0 && !addingCat && (
          <Text style={styles.emptyCard}>No categories yet. Add one to start organizing your lists.</Text>
        )}
        {addingCat ? (
          <View style={[styles.row, { marginTop: 12 }]}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={newCatName}
              onChangeText={setNewCatName}
              placeholder="e.g. Store, Section, Shopper"
              placeholderTextColor="#aaa"
              autoFocus
              onSubmitEditing={addCategory}
            />
            <TouchableOpacity style={[styles.inlineBtn, { backgroundColor: accent }]} onPress={addCategory}>
              <Text style={styles.inlineBtnText}>Add</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.inlineBtn, { backgroundColor: '#eee' }]} onPress={() => { setAddingCat(false); setNewCatName(''); }}>
              <Text style={[styles.inlineBtnText, { color: '#666' }]}>✕</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.generateBtn, { borderColor: accent, marginTop: categoryTypes.length > 0 ? 12 : 4 }]}
            onPress={() => setAddingCat(true)}
          >
            <Text style={[styles.generateBtnText, { color: accent }]}>+ Add Category</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Sign out */}
      <TouchableOpacity style={styles.signOut} onPress={() => supabase.auth.signOut()}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f5f0e8' },
  content: { padding: 16, paddingBottom: 300 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f0e8' },
  empty: { color: '#999' },
  unitBanner: { borderRadius: 14, padding: 20, marginBottom: 24 },
  unitBannerName: { fontSize: 22, fontWeight: '800', color: '#fff' },
  unitBannerRole: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 4, textTransform: 'capitalize' },
  sectionHeader: { fontSize: 13, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 24 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  fieldLabel: { fontSize: 13, color: '#888', marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    backgroundColor: '#f5f0e8',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#e0d8cc',
  },
  inlineBtn: { padding: 12, borderRadius: 8 },
  inlineBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  disabled: { opacity: 0.6 },
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  memberDivider: { borderBottomWidth: 1, borderBottomColor: '#f0ebe3' },
  avatar: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  memberRole: { fontSize: 12, color: '#999', marginTop: 1, textTransform: 'capitalize' },
  chevron: { fontSize: 18, color: '#bbb', fontWeight: '700', paddingHorizontal: 4 },
  rolePicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 12, paddingLeft: 48 },
  roleChip: { borderWidth: 1.5, borderColor: '#e0d8cc', borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14 },
  roleChipDisabled: { borderColor: '#efe9df', backgroundColor: '#faf7f1' },
  roleChipText: { fontSize: 13, fontWeight: '600', color: '#666' },
  inviteRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0ebe3' },
  inviteInfo: { flex: 1 },
  inviteCode: { fontSize: 20, fontWeight: '800', letterSpacing: 2, color: '#1a1a1a', fontFamily: 'monospace' },
  inviteMeta: { fontSize: 12, color: '#aaa', marginTop: 2 },
  inviteActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  shareBtn: { padding: 6 },
  shareBtnText: { fontWeight: '700', fontSize: 14 },
  deactivateBtn: { color: '#c0392b', fontSize: 18, fontWeight: '700', padding: 4 },
  generateBtn: { marginTop: 12, borderWidth: 1.5, borderRadius: 10, padding: 12, alignItems: 'center', borderStyle: 'dashed' },
  generateBtnText: { fontWeight: '700', fontSize: 14 },
  emptyCard: { color: '#aaa', fontSize: 13, textAlign: 'center', paddingVertical: 8 },
  previewBanner: { borderRadius: 10, padding: 14, marginTop: 12, marginBottom: 16 },
  previewText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  saveUnitBtn: { flex: 1, padding: 14, borderRadius: 10, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelUnitBtn: { flex: 1, padding: 14, borderRadius: 10, alignItems: 'center', backgroundColor: '#f0ebe3' },
  cancelText: { color: '#888', fontSize: 15 },
  dangerText: { fontSize: 13, color: '#a04036', lineHeight: 19 },
  deleteUnitBtn: { borderWidth: 1.5, borderColor: '#c0392b', borderRadius: 10, padding: 12, alignItems: 'center', borderStyle: 'dashed' },
  deleteUnitBtnText: { color: '#c0392b', fontWeight: '700', fontSize: 14 },
  deleteConfirmBtn: { flex: 1, padding: 14, borderRadius: 10, alignItems: 'center', backgroundColor: '#c0392b' },
  signOut: { marginTop: 32, backgroundColor: '#c0392b', padding: 16, borderRadius: 12, alignItems: 'center' },
  signOutText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
