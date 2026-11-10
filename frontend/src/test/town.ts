// テスト用の街の地図。Rails が返すものと同じファイル（backend/config/towns）を読み、API と同じ検証を通す
import festival from "../../../backend/config/towns/festival-street.json";
import { parseTown } from "../api/town";

export const TOWN = parseTown(festival);
