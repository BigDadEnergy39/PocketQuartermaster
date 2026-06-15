import { View, TouchableOpacity, StyleSheet } from 'react-native';

export const UNIT_COLORS = [
  '#2d5a27', // Scout green
  '#8b6914', // Khaki/tan
  '#c0392b', // Red
  '#1a5276', // Navy blue
  '#6c3483', // Purple
  '#117a65', // Teal
  '#784212', // Brown
  '#1f618d', // Steel blue
];

interface Props {
  selected: string;
  onSelect: (color: string) => void;
}

export function ColorPicker({ selected, onSelect }: Props) {
  return (
    <View style={styles.row}>
      {UNIT_COLORS.map(color => (
        <TouchableOpacity
          key={color}
          style={[styles.swatch, { backgroundColor: color }, selected === color && styles.selected]}
          onPress={() => onSelect(color)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: { width: 36, height: 36, borderRadius: 18 },
  selected: { borderWidth: 3, borderColor: '#fff', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 4, elevation: 4 },
});
