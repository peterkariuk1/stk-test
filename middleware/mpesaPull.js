import axios from "axios";
import { generateToken } from "./mpesa.js";

const BASE_URL = "https://api.safaricom.co.ke";

/**
 * 1. Register Pull (ONE TIME)
 */
export const registerPullShortcode = async () => {
    const token = await generateToken();

    const payload = {
        ShortCode: 510481,
        RequestType: "Pull",
        NominatedNumber: 254728290280,
        CallBackURL: "https://stk-test.onrender.com/api/pull-callback",
    };

    try {
        const { data } = await axios.post(
            `${BASE_URL}/pulltransactions/v1/register`,
            payload,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
            }
        );

        console.log("✅ Pull Registration Response:", data);
        return data;

    } catch (error) {
        console.error("❌ Pull Registration Error:", error.response?.data || error.message);
        throw error;
    }
};

/**
 * 2. Query Pull Transactions
 */
export const queryPullTransactions = async ({
    startDate,
    endDate,
    offset = 0,
}) => {
    const token = await generateToken();

    const payload = {
        ShortCode: 510481,
        StartDate: startDate,
        EndDate: endDate,
        OffSetValue: offset.toString(),
    };

    try {
        const { data } = await axios.post(
            `${BASE_URL}/pulltransactions/v1/query`,
            payload,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
            }
        );

        console.log("✅ Pull Query Response:", data);
        return data;

    } catch (error) {
        console.error("❌ Pull Query Error:", error.response?.data || error.message);
        throw error;
    }
};
