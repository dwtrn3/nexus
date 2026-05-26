import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  withCredentials: true
})

// On 401: clear local auth state and redirect to login cleanly.
// Avoid a hard window.location reload (which causes the blank-page flash).
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      // Only redirect if we're not already on login/setup
      const path = window.location.pathname
      if (path !== '/login' && path !== '/setup') {
        window.location.replace('/login')
      }
    }
    return Promise.reject(err)
  }
)

export default api
