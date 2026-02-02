import { useEffect, useRef, useCallback } from 'react';

interface NotificationOptions {
  title: string;
  body?: string;
  icon?: string;
  tag?: string;
}

export function useBrowserNotification() {
  const permissionRef = useRef<NotificationPermission>('default');

  // Request permission on mount
  useEffect(() => {
    if ('Notification' in window) {
      permissionRef.current = Notification.permission;
      
      if (Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
          permissionRef.current = permission;
          console.log('[Notifications] Permission:', permission);
        });
      }
    }
  }, []);

  const sendNotification = useCallback((options: NotificationOptions) => {
    // Don't notify if page is visible/focused
    if (document.visibilityState === 'visible') {
      return;
    }

    // Check if notifications are supported and permitted
    if (!('Notification' in window)) {
      console.log('[Notifications] Not supported');
      return;
    }

    if (permissionRef.current !== 'granted') {
      console.log('[Notifications] Permission not granted');
      return;
    }

    // Send notification
    const notification = new Notification(options.title, {
      body: options.body,
      icon: options.icon || '/favicon.ico',
      tag: options.tag || 'dangerousbot-message',
      requireInteraction: false,
      silent: false,
    });

    // Auto-close after 5 seconds
    setTimeout(() => {
      notification.close();
    }, 5000);

    // Focus window on click
    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    return notification;
  }, []);

  return { sendNotification };
}
