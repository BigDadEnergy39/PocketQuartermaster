import { View, Text, StyleSheet } from 'react-native';

export default function Shopping() {
  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>Shopping list coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f0e8' },
  placeholder: { color: '#999', fontSize: 16 },
});
