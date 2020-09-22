import Axios from "axios";

export const postServerNode = async <T = any, Y = any>(nodeUrl: string, endpoint: string, data: T): Promise<Y> => {
  const res = await Axios.post(`${nodeUrl}/${endpoint}`, data);
  return res.data;
};

export const getServerNode = async <T = any>(nodeUrl: string, endpoint: string): Promise<T> => {
  const res = await Axios.get(`${nodeUrl}/${endpoint}`);
  return res.data;
};
