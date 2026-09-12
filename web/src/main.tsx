import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App as AntdApp, ConfigProvider } from 'antd';
import viVN from 'antd/locale/vi_VN';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { App } from './App';
import { theme } from './config/theme';
import 'dayjs/locale/vi';
import './index.css';
// Font Inter tự phục vụ từ node_modules, không gọi ra Google Fonts — máy chủ
// đặt tại công ty, không phụ thuộc mạng ngoài. Subset latin + tiếng Việt.
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/vietnamese-400.css';
import '@fontsource/inter/vietnamese-500.css';
import '@fontsource/inter/vietnamese-600.css';
import '@fontsource/inter/vietnamese-700.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Interceptor đã tự làm mới token khi gặp 401, nên thử lại ở tầng này
      // chỉ làm lỗi thật bị che đi và chậm phản hồi.
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider locale={viVN} theme={theme}>
      {/* AntdApp để message/notification lấy được theme và locale;
          thiếu nó antd sẽ cảnh báo "static function can not consume context" */}
      <AntdApp>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AuthProvider>
              <App />
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </AntdApp>
    </ConfigProvider>
  </StrictMode>,
);
