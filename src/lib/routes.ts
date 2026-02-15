import { RouteName, RouteState } from '../types/models';

export const routeTitle = (name: RouteName) => {
  if (name === 'home') return 'CommonBox';
  if (name === 'profile') return 'Profile';
  if (name === 'friends') return 'Friends';
  if (name === 'notifications') return 'Notifications';
  return 'Chat Room';
};

export const navigateAndClose = (
  navigate: (route: RouteState) => void,
  close: () => void,
  route: RouteState
) => {
  navigate(route);
  close();
};
