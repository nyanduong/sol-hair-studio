import { StatusBar } from 'expo-status-bar'
import { Pressable, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import BottomNav from '../../../navigation/BottomNav.jsx'
import { colors } from '../../../theme/tokens.js'
import { useAuth } from '../../auth/hooks/useAuth.js'
import ServicesList from '../components/ServicesList.jsx'
import styles from '../styles/ServicesScreen.styles.js'

export default function ServicesScreen({ navigation }) {
  const { account } = useAuth()
  const isOwner = Boolean(account?.roles?.includes('owner'))

  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
      <ServicesList
        navigation={navigation}
        header={
          <View style={styles.header}>
            <Text style={styles.brand}>DỊCH VỤ TẠI SOL</Text>
            <Text accessibilityRole="header" style={styles.title}>
              Dành một chút cho chính mình.
            </Text>
            <Text style={styles.intro}>Bắt đầu từ điều mái tóc bạn đang cần.</Text>

            {isOwner && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Mở màn hình quản lý dịch vụ cho chủ tiệm"
                onPress={() => navigation.navigate('OwnerServices')}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: '#fbf4ec',
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 14,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  marginTop: 12,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="settings" size={16} color={colors.copper} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.copper }}>
                    Quản lý dịch vụ (Khu vực Chủ tiệm)
                  </Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.copper} />
              </Pressable>
            )}
          </View>
        }
      />
      <BottomNav navigation={navigation} active="Services" />
      <StatusBar style="dark" />
    </SafeAreaView>
  )
}
