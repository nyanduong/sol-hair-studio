import StylistServiceHistoryScreen from '../features/appointments/screens/StylistServiceHistoryScreen.jsx'
import StylistAppointmentsScreen from '../features/appointments/screens/StylistAppointmentsScreen.jsx'
import StylistAppointmentDetailScreen from '../features/appointments/screens/StylistAppointmentDetailScreen.jsx'
import CustomerAppointmentRescheduleScreen from '../features/appointments/screens/CustomerAppointmentRescheduleScreen.jsx'
import CustomerAppointmentDetailScreen from '../features/appointments/screens/CustomerAppointmentDetailScreen.jsx'
import CustomerAppointmentsScreen from '../features/appointments/screens/CustomerAppointmentsScreen.jsx'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import ForgotPasswordScreen from '../features/auth/screens/ForgotPasswordScreen.jsx'
import LoginScreen from '../features/auth/screens/LoginScreen.jsx'
import OtpVerificationScreen from '../features/auth/screens/OtpVerificationScreen.jsx'
import ProfileScreen from '../features/auth/screens/ProfileScreen.jsx'
import RegisterScreen from '../features/auth/screens/RegisterScreen.jsx'
import ResetPasswordScreen from '../features/auth/screens/ResetPasswordScreen.jsx'
import HealthScreen from '../features/health/screens/HealthScreen.jsx'
import HomeScreen from '../features/home/screens/HomeScreen.jsx'
import ServicesScreen from '../features/services/screens/ServicesScreen.jsx'
import { colors } from '../theme/tokens.js'
import BookingScreen from '../features/booking/screens/BookingScreen.jsx'
import StylistShiftsScreen from '../features/staff/screens/StylistShiftsScreen.jsx'

const Stack = createNativeStackNavigator()

export default function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="Services" component={ServicesScreen} />
      <Stack.Screen name="CustomerAppointments" component={CustomerAppointmentsScreen} />
      <Stack.Screen name="CustomerAppointmentDetail" component={CustomerAppointmentDetailScreen} getId={({ params }) => params?.appointmentId} />
      <Stack.Screen name="CustomerAppointmentReschedule" component={CustomerAppointmentRescheduleScreen} getId={({ params }) => params?.appointmentId} />
      <Stack.Screen name="Booking" component={BookingScreen} />
      <Stack.Screen name="StylistAppointments" component={StylistAppointmentsScreen} />
      <Stack.Screen name="StylistAppointmentDetail" component={StylistAppointmentDetailScreen} getId={({ params }) => params?.appointmentId} />
      <Stack.Screen name="StylistServiceHistory" component={StylistServiceHistoryScreen} getId={({ params }) => params?.appointmentId} />
      <Stack.Screen name="StylistShifts" component={StylistShiftsScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="OtpVerification" component={OtpVerificationScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen
        name="Health"
        component={HealthScreen}
        options={{
          headerShown: true,
          title: 'Kết nối API',
          headerTintColor: colors.copper,
          headerStyle: { backgroundColor: colors.canvas },
        }}
      />
    </Stack.Navigator>
  )
}
