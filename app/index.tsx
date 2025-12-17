import { Redirect, usePathname } from 'expo-router';

export default function Index() {
  const pathname = usePathname();

  // Only redirect if not already on a tab route
  if (pathname.startsWith('/(tabs)')) {
    return null;
  }

  return <Redirect href="/(tabs)/camera" />;
}
