# TWITCH SIM — второй стример

Страница остаётся статическим сайтом. Для приглашения второго стримера она использует Firebase Realtime Database только для обмена данными подключения; видео и звук передаются напрямую через WebRTC. Для камеры оба участника должны открыть страницу по HTTPS и разрешить Safari доступ к камере и микрофону.

## Настройка Firebase

1. Создай проект в [Firebase Console](https://console.firebase.google.com/).
2. В настройках проекта добавь веб-приложение и скопируй его `firebaseConfig`.
3. Создай **Realtime Database**. Скопируй её URL вида `https://<project>-default-rtdb.<region>.firebasedatabase.app` (или URL `...firebaseio.com`, который покажет консоль).
4. В **Authentication → Sign-in method** включи провайдер **Anonymous**.
5. В **Authentication → Settings → Authorized domains** добавь домен GitHub Pages сайта: `2h29m4y68k-ux.github.io`. Для теста с локального сервера добавь также `localhost`.
6. В **Realtime Database → Rules** замени правила на приведённые ниже и опубликуй их.
7. В `index.html` найди `FIREBASE_CONFIG` и замени значения `apiKey`, `authDomain`, `databaseURL`, `projectId` и `appId` значениями своего веб-приложения.
8. Опубликуй обновлённый `index.html`. Нажми **Гость**, разреши доступ к камере/микрофону и отправь созданную ссылку второму стримеру.

Веб-конфигурация Firebase и `apiKey` являются публичными настройками клиента, а не секретом. Не вставляй в страницу service-account JSON, приватные ключи или пароли. Защита комнат обеспечивается анонимной авторизацией, случайными идентификаторами приглашений и правилами ниже. Не отправляй ссылку-приглашение посторонним: любой обладатель ссылки может занять место гостя.

### Правила Realtime Database

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "rooms": {
      "$roomId": {
        ".read": "auth != null",
        ".write": "auth != null && ((!data.exists() && newData.child('hostUid').val() === auth.uid) || (data.exists() && !newData.exists() && data.child('hostUid').val() === auth.uid))",
        "guestUid": {
          ".write": "auth != null && ((!data.exists() && newData.val() === auth.uid) || (data.val() === auth.uid && !newData.exists()))"
        },
        "offer": {
          ".write": "auth != null && auth.uid === root.child('rooms').child($roomId).child('hostUid').val()"
        },
        "hostCandidates": {
          ".write": "auth != null && auth.uid === root.child('rooms').child($roomId).child('hostUid').val()"
        },
        "answer": {
          ".write": "auth != null && auth.uid === root.child('rooms').child($roomId).child('guestUid').val()"
        },
        "guestCandidates": {
          ".write": "auth != null && auth.uid === root.child('rooms').child($roomId).child('guestUid').val()"
        }
      }
    }
  }
}
```

## Ограничения

- Используется бесплатный публичный STUN-сервер для прямой WebRTC-связи. Некоторые корпоративные, мобильные или ограниченные сети блокируют такое соединение; для них потребуется TURN-сервер. Видео через Firebase не проходит.
- Комната закрывается, когда её создатель завершает подключение или закрывает страницу. После отключения гостя для повторного входа нужно создать новое приглашение.
- Оба участника должны держать страницу открытой. Safari/iOS может приостанавливать камеру или соединение, когда вкладка свёрнута или экран заблокирован.
- Firebase Realtime Database имеет бесплатный лимит, но условия и лимиты Firebase могут меняться; проверь тарифы и квоты проекта в Firebase Console.
