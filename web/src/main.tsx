import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App as AntdApp, ConfigProvider } from 'antd';
import viVN from 'antd/locale/vi_VN';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { App } from './App';
import 'dayjs/locale/vi';

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
    <ConfigProvider locale={viVN}>
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
