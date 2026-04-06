import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Drawer } from 'expo-router/drawer';
import { Image, LayoutGrid, Lock, Star, Trash2 } from 'lucide-react-native';
import CustomDrawerContent from '../../components/DrawerContent';
import { useAppTheme } from '../../theme/AppThemeContext';

export default function DrawerLayout() {
  const { colors } = useAppTheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Drawer
        drawerContent={(props) => <CustomDrawerContent {...props} />}
        screenOptions={{
          headerStyle: {
            backgroundColor: colors.surface,
          },
          headerTintColor: colors.text,
          drawerStyle: {
            backgroundColor: colors.surface,
            width: 280,
          },
          drawerActiveTintColor: colors.primary,
          drawerInactiveTintColor: colors.textMuted,
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      >
        <Drawer.Screen
          name="index"
          options={{
            drawerLabel: 'Todas las fotos',
            title: 'galetiki',
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
        <Drawer.Screen
          name="private"
          options={{
            drawerLabel: 'Privadas',
            title: 'Privadas',
            drawerIcon: ({ color, size }) => <Lock color={color} size={size} />,
          }}
        />
      </Drawer>
    </GestureHandlerRootView>
  );
}
