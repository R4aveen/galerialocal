import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Drawer } from 'expo-router/drawer';
import { COLORS } from '../../constants/theme';
import { Image, LayoutGrid, Star, Trash2 } from 'lucide-react-native';
import CustomDrawerContent from '../../components/DrawerContent';

export default function DrawerLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Drawer
        drawerContent={(props) => <CustomDrawerContent {...props} />}
        screenOptions={{
          headerStyle: {
            backgroundColor: COLORS.surface,
          },
          headerTintColor: COLORS.text,
          drawerStyle: {
            backgroundColor: COLORS.surface,
            width: 280,
          },
          drawerActiveTintColor: COLORS.primary,
          drawerInactiveTintColor: COLORS.textMuted,
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      >
        <Drawer.Screen
          name="index"
          options={{
            drawerLabel: 'Todas las fotos',
            title: 'GaleriaLocal',
            drawerIcon: ({ color, size }) => <Image color={color} size={size} />,
          }}
        />
        <Drawer.Screen
          name="albums"
          options={{
            drawerLabel: 'Álbumes',
            title: 'Álbumes',
            drawerIcon: ({ color, size }) => <LayoutGrid color={color} size={size} />,
          }}
        />
        <Drawer.Screen
          name="favorites"
          options={{
            drawerLabel: 'Favoritos',
            title: 'Favoritos',
            drawerIcon: ({ color, size }) => <Star color={color} size={size} />,
          }}
        />
        <Drawer.Screen
          name="trash"
          options={{
            drawerLabel: 'Papelera',
            title: 'Papelera',
            drawerIcon: ({ color, size }) => <Trash2 color={color} size={size} />,
          }}
        />
      </Drawer>
    </GestureHandlerRootView>
  );
}
