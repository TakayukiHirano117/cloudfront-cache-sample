export type MockUser = {
  id: string;
  displayName: string;
  email: string;
  department: string;
  role: string;
  /** S3 object key served via CloudFront (not a full URL). */
  photoObjectKey: string;
};

export const mockUser: MockUser = {
  id: "usr_demo_001",
  displayName: "山田 太郎",
  email: "yamada.taro@example.com",
  department: "Identity & Access",
  role: "Security Engineer",
  photoObjectKey: "users/demo/face.png",
};
