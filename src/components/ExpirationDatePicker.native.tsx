import { useState } from 'react';
import { Platform, TouchableOpacity, Text, StyleSheet } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

interface Props {
  value: Date;
  onChange: (date: Date) => void;
  minimumDate?: Date;
}

// Native (iOS/Android) expiration date picker. The native-only
// @react-native-community/datetimepicker import lives here so it never reaches
// the web bundle — Metro resolves ExpirationDatePicker.web.tsx on web instead.
export default function ExpirationDatePicker({ value, onChange, minimumDate }: Props) {
  const [show, setShow] = useState(Platform.OS === 'ios');

  return (
    <>
      {Platform.OS === 'android' && (
        <TouchableOpacity style={styles.dateBtn} onPress={() => setShow(true)}>
          <Text style={styles.dateBtnText}>{value.toLocaleDateString()}</Text>
        </TouchableOpacity>
      )}
      {(show || Platform.OS === 'ios') && (
        <DateTimePicker
          value={value}
          mode="date"
          minimumDate={minimumDate}
          onChange={(_, date) => {
            if (Platform.OS === 'android') setShow(false);
            if (date) onChange(date);
          }}
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  dateBtn: { backgroundColor: '#f5f0e8', borderRadius: 10, padding: 14 },
  dateBtnText: { fontSize: 16, color: '#1a1a1a' },
});
